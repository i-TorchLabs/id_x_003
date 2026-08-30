# -*- coding: utf-8 -*-
# 发送问卷调查邮件
#
# 定时任务: 每隔2小时发送一次
# 0 */2 * * * /usr/bin/python /home/x/Desktop/codeSpace/i-Core/x_models/id_x_003/scripts/send_question_mail.py >> /var/log/cron/send_aa_question_mail.log 2>&1
#

import smtplib
import time
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import psycopg2
from psycopg2.extras import DictCursor

CONFIG = {
    "host": "localhost",
    "port": 15432,
    "user": "postgres",
    "password": "P@ssmickey233!",
    "database": "sme_cdc_enlist_aa",
}

MAIL_SERVER = "mail.cuhk.edu.cn"
MAIL_PORT = 587
MAIL_USER = "careersme@cuhk.edu.cn"
MAIL_PASSWORD = "n04n8#X4O48@4Gh0oqw93"
MAIL_FROM = "careersme@cuhk.edu.cn"
MAIL_CC = ""

SQL_1 = "SELECT * FROM aa_enlist_apply;"
SQL_2 = "SELECT * FROM aa_enlist_activity WHERE id = %s;"
SQL_3 = "SELECT * FROM aa_html_template WHERE type = 'question';"
SQL_4 = "UPDATE aa_enlist_apply SET send_question = 'True' WHERE id = %s;"


def main():
    now_time = time.strftime("%Y-%m-%d %H:%M:%S")

    print("#" * 10, " send_question_mail ", now_time, "#" * 10)

    conn = psycopg2.connect(**CONFIG)
    with conn.cursor(cursor_factory=DictCursor) as cur:
        cur.execute(SQL_1)
        res = cur.fetchall()
        for row in res:
            try:
                sql_2 = SQL_2.format(_id=row.get("activity_id", "1"))
                cur.execute(sql_2, (row.get("activity_id", "1"),))
                result = cur.fetchall()
            except Exception as e:
                print("查询活动信息失败", e)
                continue
            if not result:
                continue
            result = result[0]
            activity_start_time = result.get("activity_start_time")
            activity_end_time = result.get("activity_end_time")
            end_time = activity_end_time.strftime("%Y-%m-%d-%H-%M-%S")
            s_time = end_time.split("-")
            specified_datetime = datetime(
                int(s_time[0]),
                int(s_time[1]),
                int(s_time[2]),
                int(s_time[3]),
                int(s_time[4]),
                int(s_time[5]),
            )
            two_hours_later = specified_datetime + timedelta(hours=2)
            now = datetime.now()
            if now < two_hours_later:
                continue
            if row.get("send_question") == "True":
                continue
            cur.execute(SQL_4, (row.get("id"),))
            print(SQL_4.format(_id=row.get("id")))
            conn.commit()
            cur.execute(SQL_3)
            result = cur.fetchall()
            result = result[0]
            html = result.get("html")
            message = MIMEMultipart("alternative")
            message["Subject"] = (
                "【SME 校友1v1咨询反馈调查】Feedback to SME Alumni 1v1 Counselling"
            )
            message["From"] = MAIL_FROM
            message["Cc"] = MAIL_CC
            message["To"] = row.get("email")
            print("Subject: ", message["Subject"])
            print("From: ", message["From"])
            print("Cc: ", message["Cc"])
            print("To: ", message["To"])
            msg = {"_date": activity_start_time.strftime("%Y-%m-%d")}
            part = MIMEText(html % msg, "html")
            message.attach(part)
            server = None
            try:
                server = smtplib.SMTP(MAIL_SERVER, MAIL_PORT)
                server.starttls()
                server.login(MAIL_USER, MAIL_PASSWORD)
                server.sendmail(MAIL_FROM, row.get("email"), message.as_string())
            except Exception as e:
                print("邮件发送失败", e)
            finally:
                if server:
                    server.quit()
                conn.close()


if __name__ == "__main__":
    main()
