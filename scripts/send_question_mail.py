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
from pathlib import Path

import psycopg2
from psycopg2.extras import DictCursor

ENV_PATH = Path(__file__).resolve().parents[1] / "ops" / ".env"


def load_env(path):
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


ENV = load_env(ENV_PATH)

CONFIG = {
    "host": "127.0.0.1",
    "port": 35432,
    "user": "postgres",
    "password": ENV["POSTGRES_PASSWORD"],
    "database": "id_x_003",
}

MAIL_SERVER = "mail.cuhk.edu.cn"
MAIL_PORT = 587
MAIL_USER = "careersme@cuhk.edu.cn"
MAIL_PASSWORD = ENV.get("AA_MAIL_PASSWORD", "")
MAIL_FROM = "careersme@cuhk.edu.cn"
MAIL_CC = ""

SQL_1 = "SELECT * FROM aa_enlist_apply;"
SQL_2 = "SELECT * FROM aa_enlist_activity WHERE id = %s;"
SQL_3 = "SELECT * FROM aa_html_template WHERE type = 'question';"
SQL_4 = "UPDATE aa_enlist_apply SET send_question = 'True' WHERE id = %s;"


def send_mail(to_addr, activity_date, html):
    message = MIMEMultipart("alternative")
    message["Subject"] = "【SME 校友1v1咨询反馈调查】Feedback to SME Alumni 1v1 Counselling"
    message["From"] = MAIL_FROM
    message["Cc"] = MAIL_CC
    message["To"] = to_addr
    print("Subject:", message["Subject"])
    print("From:", message["From"])
    print("Cc:", message["Cc"])
    print("To:", message["To"])
    part = MIMEText(html % {"_date": activity_date.strftime("%Y-%m-%d")}, "html")
    message.attach(part)
    with smtplib.SMTP(MAIL_SERVER, MAIL_PORT) as server:
        server.starttls()
        server.login(MAIL_USER, MAIL_PASSWORD)
        server.sendmail(MAIL_FROM, to_addr, message.as_string())


def main():
    print("#" * 10, " send_question_mail ", time.strftime("%Y-%m-%d %H:%M:%S"), "#" * 10)

    now = datetime.now()
    conn = psycopg2.connect(**CONFIG)
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 邮件模板只需查询一次
            cur.execute(SQL_3)
            tpl = cur.fetchone()
            if not tpl:
                print("未找到问卷邮件模板 (type='question')")
                return
            html = tpl["html"]

            cur.execute(SQL_1)
            rows = cur.fetchall()
            for row in rows:
                try:
                    if row.get("send_question") == "True":
                        continue

                    cur.execute(SQL_2, (row.get("activity_id", "1"),))
                    activity = cur.fetchone()
                    if not activity:
                        continue

                    activity_end_time = activity.get("activity_end_time")
                    activity_start_time = activity.get("activity_start_time")
                    if not activity_end_time or not activity_start_time:
                        continue

                    # 活动结束 2 小时后才发送问卷
                    if now < activity_end_time + timedelta(hours=2):
                        continue

                    send_mail(row["email"], activity_start_time, html)

                    # 发送成功后才标记已发送
                    cur.execute(SQL_4, (row["id"],))
                    conn.commit()
                    print("已发送问卷邮件: apply_id=%s email=%s" % (row["id"], row["email"]))
                except Exception as e:
                    conn.rollback()
                    print("处理报名记录失败 id=%s: %s" % (row.get("id"), e))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
