import requests
import datetime

BASE_URL = "https://statsapi.mlb.com/api/v1"

#Need to work on date selecting function

def targetDate():
    pass

#This is the code to send the notification to a phone
def sendNotification():
    pass

schedule_resp = requests.get(
    f"{BASE_URL}/schedule",
    params={"sportId": 1, "date": "2026-10-03"}
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
