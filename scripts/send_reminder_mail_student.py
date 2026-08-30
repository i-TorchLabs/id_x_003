# -*- coding: utf-8 -*-
# 发送提醒邮件-学生
#
# 定时任务: 每天21点发送
# 0 21 * * * /usr/bin/python /home/x/Desktop/codeSpace/i-Core/x_models/id_x_003/scripts/send_reminder_mail_student.py >> /var/log/cron/send_aa_reminder_mail_student.log 2>&1
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
MAIL_CC = "careersme@cuhk.edu.cn"

SQL_1 = "SELECT * FROM aa_enlist_apply;"
SQL_2 = "SELECT * FROM aa_enlist_activity WHERE id = %s;"
SQL_3 = "SELECT * FROM aa_html_template WHERE type = 'reminder-student';"
SQL_4 = "SELECT * FROM aa_enlist_project WHERE id = %s;"


def main():
    now_time = time.strftime("%Y-%m-%d %H:%M:%S")

    print("#" * 10, " send_reminder_mail_student ", now_time, "#" * 10)

    conn = psycopg2.connect(**CONFIG)
    with conn.cursor(cursor_factory=DictCursor) as cur:
        cur.execute(SQL_1)
        res = cur.fetchall()
        for row in res:
            sql_2 = SQL_2.format(_id=row.get("activity_id", "1"))
            cur.execute(sql_2, (row.get("activity_id", "1"),))
            result = cur.fetchall()
            if not result:
                continue
            result = result[0]
            project_id = result.get("project_id")
            activity_name = result.get("name")
            activity_start_time = result.get("activity_start_time")
            start_time = activity_start_time.strftime("%Y-%m-%d")
            s_time = start_time.split(" ")[0].split("-")
            specified_datetime = datetime(
                int(s_time[0]), int(s_time[1]), int(s_time[2])
            )
            one_day_before = specified_datetime - timedelta(days=1)
            today = datetime.now()
            if not one_day_before.date() == today.date():
                continue
            activity_end_time = result.get("activity_end_time")
            sql_4 = SQL_4.format(_id=project_id)
            cur.execute(sql_4, (project_id,))
            result = cur.fetchall()
            if not result:
                continue
            result = result[0]
            cur.execute(SQL_3)
            result = cur.fetchall()
            result = result[0]
            html = result.get("html")
            message = MIMEMultipart("alternative")
            message["Subject"] = (
                "[Reminder] Alumni Advising Counselling with " + activity_name
            )
            message["From"] = MAIL_FROM
            message["Cc"] = MAIL_CC
            message["To"] = row.get("email")
            current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
            print(
                f"[reminder.mail.student][{current_time}] Subject: ", message["Subject"]
            )
            print(f"[reminder.mail.student][{current_time}] From: ", message["From"])
            print(f"[reminder.mail.student][{current_time}] Cc: ", message["Cc"])
            print(f"[reminder.mail.student][{current_time}] To: ", message["To"])
            html_msg = html.format(
                _title=activity_name,
                _date=activity_start_time.strftime("%Y-%m-%d"),
                _start_time=activity_start_time.strftime("%H:%M"),
                _end_time=activity_end_time.strftime("%H:%M"),
            )
            part = MIMEText(html_msg, "html")
            message.attach(part)

            smtp_server = MAIL_SERVER
            smtp_port = MAIL_PORT
            smtp_user = MAIL_USER
            smtp_password = MAIL_PASSWORD

            server = None
            try:
                server = smtplib.SMTP(smtp_server, smtp_port)
                server.starttls()
                to_addr = message["To"]
                cc_addr = message["Cc"]
                all_recipients = [to_addr] if isinstance(to_addr, str) else to_addr
                if cc_addr:
                    all_recipients.append(cc_addr)
                server.login(smtp_user, smtp_password)
                server.sendmail(MAIL_FROM, all_recipients, message.as_string())
            except Exception as e:
                print("邮件发送失败", e)
            finally:
                if server:
                    server.quit()
        conn.close()


if __name__ == "__main__":
    main()
