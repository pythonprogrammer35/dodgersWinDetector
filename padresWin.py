import requests
from datetime import date, timedelta
from dotenv import load_dotenv


from twilio.rest import Client
import os

import smtplib
from email.mime.text import MIMEText


BASE_URL = "https://statsapi.mlb.com/api/v1"

#Need to work on date selecting function

def targetDate():
    yesterday = date.today() - timedelta(days=1)
    yesterday_str = yesterday.isoformat()

    return yesterday_str

def sendNotification():
    # Email account settings
    SENDER_EMAIL = "dodgerbot90@gmail.com"
    # For Gmail, generate an "App Password" at: myaccount.google.com/apppasswords
    APP_PASSWORD = "bczl ytpi imwa ljmn"

    # Your recipient phone address
    RECIPIENT_SMS_EMAIL = "braedoncollett@gmail.com"  # Replace with number + carrier domain
    subject = "DodgerWin!"
    body = "Dodgers won Yesterday!"
    msg = MIMEText(body)
    msg["From"] = SENDER_EMAIL
    msg["To"] = RECIPIENT_SMS_EMAIL
    msg["Subject"] = subject

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.sendmail(SENDER_EMAIL, RECIPIENT_SMS_EMAIL, msg.as_string())

    print("Email sent!")

yesterday = targetDate()

schedule_resp = requests.get(
    f"{BASE_URL}/schedule",
    params={"sportId": 1, "date": yesterday}
)
schedule_data = schedule_resp.json()

#Check if we won at home

for date in schedule_data.get("dates", []):
    for game in date.get("games", []):
        
        away = game["teams"]["away"]["team"]["name"]
        home = game["teams"]["home"]["team"]["name"]

        if(home == "Los Angeles Dodgers"):
            print("true")
            
            if(game['teams']['home']['isWinner'] == True):
                print("we won")
                sendNotification()
            
        print(f"{away} @ {home} (GamePK: {game['gamePk']})")
