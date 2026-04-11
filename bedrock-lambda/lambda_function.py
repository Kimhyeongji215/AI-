import json
import boto3
import pymysql
import os

from botocore.exceptions import ClientError


def lambda_handler(event, context):
    print("EC2 -> Lambda로 전달된 데이터", event)

    bedrock = boto3.client(service_name="bedrock-runtime", region_name="us-east-1")

    try:
        # Function URL은 body를 문자열로 감싸서 전달
        if "body" in event:
            body = event["body"]
            input_data = json.loads(body) if isinstance(body, str) else body
        else:
            input_data = event
    except json.JSONDecodeError as e:
        print("JSON 파싱 오류:", e)
        return {"statusCode": 400, "body": "Invalid JSON format"}

    action = input_data.get("action")
    
    if action == "generate_exam":
        return generate_exam(bedrock, input_data)
    elif action == "explain_answer":
        return explain_answer(bedrock, input_data)
    else:
        return {"statusCode": 400, "body": "Invalid action"}


def generate_exam(bedrock, input_data):
    content = input_data.get("content")
    exam_id = input_data.get("examId")
    question_count = input_data.get("questionCount", 5)

    if not content or not exam_id:
        return {"statusCode": 400, "body": "content와 examId가 필요합니다"}

    system_prompt = f"""당신은 시험 출제 전문가입니다. 아래 학습 내용을 바탕으로 객관식 모의시험 문제를 {question_count}개 만들어주세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
[
  {{
    "question": "문제 내용",
    "options": ["보기1", "보기2", "보기3", "보기4"],
    "answer": 0
  }}
]

- answer는 정답 보기의 인덱스(0~3)입니다.
- 문제는 한국어로 작성하세요.
- 보기는 반드시 4개씩 만드세요."""

    try:
        model_id = "amazon.nova-lite-v1:0"
        messages = [{"role": "user", "content": [{"text": content}]}]

        response = bedrock.converse(
            modelId=model_id,
            messages=messages,
            system=[{"text": system_prompt}],
            inferenceConfig={"maxTokens": 4000, "temperature": 0.7},
        )

        ai_response = response["output"]["message"]["content"][0]["text"]
        print("AI 문제 생성 완료:", ai_response)

        # DB에 저장
        db = pymysql.connect(
            host=os.environ["DB_HOST"],
            user=os.environ["DB_USER"],
            password=os.environ["DB_PASSWORD"],
            database=os.environ["DB_NAME"],
            cursorclass=pymysql.cursors.DictCursor,
        )

        try:
            with db.cursor() as cursor:
                sql = "UPDATE exams SET questions = %s, status = 'ready' WHERE id = %s"
                cursor.execute(sql, (ai_response, exam_id))
                db.commit()
        finally:
            db.close()

        return ai_response

    except (ClientError, Exception) as e:
        print(f"Error: {e}")
        raise Exception("Lambda function error")


def explain_answer(bedrock, input_data):
    question = input_data.get("question")
    options = input_data.get("options")
    answer = input_data.get("answer")
    exam_id = input_data.get("examId")
    question_index = input_data.get("questionIndex")

    if not question or options is None or answer is None:
        return {"statusCode": 400, "body": "question, options, answer가 필요합니다"}

    options_text = "\n".join([f"{i+1}. {opt}" for i, opt in enumerate(options)])
    system_prompt = """당신은 친절한 교육 전문가입니다. 주어진 시험 문제에 대해 왜 해당 보기가 정답인지, 나머지 보기는 왜 틀렸는지 상세하게 한국어로 설명해주세요. 학생이 이해하기 쉽게 설명하세요."""

    user_message = f"""문제: {question}

보기:
{options_text}

정답: {answer + 1}번

이 문제의 정답이 왜 {answer + 1}번인지 설명해주세요."""

    try:
        model_id = "amazon.nova-lite-v1:0"
        messages = [{"role": "user", "content": [{"text": user_message}]}]

        response = bedrock.converse(
            modelId=model_id,
            messages=messages,
            system=[{"text": system_prompt}],
            inferenceConfig={"maxTokens": 2000, "temperature": 0.5},
        )

        ai_response = response["output"]["message"]["content"][0]["text"]
        print("AI 해석 완료:", ai_response)

        return ai_response

    except (ClientError, Exception) as e:
        print(f"Error: {e}")
        raise Exception("Lambda function error")
