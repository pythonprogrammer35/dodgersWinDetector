
import boto3
import os
from botocore.exceptions import ClientError

# Connect to our DynamoDB table
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["SUBSCRIBERS_TABLE"])

def lambda_handler(event, context):

    # Check if the event came from Cognito confirmation
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    # Get user information from Cognito
    attributes = event["request"]["userAttributes"]

    subscriber_id = attributes["sub"]
    email = attributes.get("email")
    email_verified = attributes.get("email_verified")

    # Only accept verified email addresses
    if not email or email_verified != "true":
        print("Email is not verified.")
        return event

    # Create subscriber record
    subscriber = {
        "subscriberId": subscriber_id,
        "email": email,
        "subscribed": False
    }

    try:
        # Save new subscriber to DynamoDB
        table.put_item(
            Item=subscriber,
            ConditionExpression="attribute_not_exists(subscriberId)"
        )

        print("Subscriber successfully registered.")

    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            print("Subscriber already exists.")
        else:
            raise

    return event
