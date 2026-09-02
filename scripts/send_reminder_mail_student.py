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
MAIL_CC = "careersme@cuhk.edu.cn"

SQL_1 = "SELECT * FROM aa_enlist_apply;"
SQL_2 = "SELECT * FROM aa_enlist_activity WHERE id = %s;"
SQL_3 = "SELECT * FROM aa_html_template WHERE type = 'reminder-student';"
SQL_4 = "SELECT * FROM aa_enlist_project WHERE id = %s;"


def send_mail(to_addr, activity_name, activity_start_time, activity_end_time, html):
    message = MIMEMultipart("alternative")
    message["Subject"] = "[Reminder] Alumni Advising Counselling with " + activity_name
    message["From"] = MAIL_FROM
    message["Cc"] = MAIL_CC
    message["To"] = to_addr
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"[reminder.mail.student][{current_time}] Subject:", message["Subject"])
    print(f"[reminder.mail.student][{current_time}] From:", message["From"])
    print(f"[reminder.mail.student][{current_time}] Cc:", message["Cc"])
    print(f"[reminder.mail.student][{current_time}] To:", message["To"])
    html_msg = html.format(
        _title=activity_name,
        _date=activity_start_time.strftime("%Y-%m-%d"),
        _start_time=activity_start_time.strftime("%H:%M"),
        _end_time=activity_end_time.strftime("%H:%M"),
    )
    message.attach(MIMEText(html_msg, "html"))
    recipients = [to_addr] + ([MAIL_CC] if MAIL_CC else [])
    with smtplib.SMTP(MAIL_SERVER, MAIL_PORT) as server:
        server.starttls()
        server.login(MAIL_USER, MAIL_PASSWORD)
        server.sendmail(MAIL_FROM, recipients, message.as_string())


def main():
    print("#" * 10, " send_reminder_mail_student ", time.strftime("%Y-%m-%d %H:%M:%S"), "#" * 10)

    today = datetime.now().date()
    conn = psycopg2.connect(**CONFIG)
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 邮件模板只需查询一次
            cur.execute(SQL_3)
            tpl = cur.fetchone()
            if not tpl:
                print("未找到提醒邮件模板 (type='reminder-student')")
                return
            html = tpl["html"]

            cur.execute(SQL_1)
            rows = cur.fetchall()
            for row in rows:
                try:
                    to_addr = row.get("email")
                    if not to_addr:
                        continue

                    cur.execute(SQL_2, (row.get("activity_id", "1"),))
                    activity = cur.fetchone()
                    if not activity:
                        continue
                    project_id = activity.get("project_id")
                    activity_name = activity.get("name")
                    activity_start_time = activity.get("activity_start_time")
                    activity_end_time = activity.get("activity_end_time")
                    if not activity_start_time or not activity_end_time:
                        continue

                    # 只在活动开始前一天发送提醒
                    if activity_start_time.date() - timedelta(days=1) != today:
                        continue

                    cur.execute(SQL_4, (project_id,))
                    if not cur.fetchone():
                        continue

                    send_mail(to_addr, activity_name, activity_start_time, activity_end_time, html)
                    print("已发送学生提醒邮件: apply_id=%s to=%s" % (row.get("id"), to_addr))
                except Exception as e:
                    print("处理报名记录失败 id=%s: %s" % (row.get("id"), e))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
