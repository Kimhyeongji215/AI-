# AI 모의시험 생성기

학습 내용을 입력하면 AI가 자동으로 객관식 모의시험을 만들어주는 웹 애플리케이션입니다.

🔗 **웹사이트**: http://kmucloud-07-s3.s3-website-us-east-1.amazonaws.com/

## 주요 기능

- 학습 내용 기반 객관식 문제 자동 생성 (3/5/10문제)
- 시험 응시 및 자동 채점
- AI 해석 기능 (문제별 정답 해설 제공)
- 시험 기록 관리 (조회/삭제)

## 아키텍처

```
[S3 정적 웹호스팅 - React] → [EC2 - Express 서버] → [Lambda - Bedrock AI]
                                                   → [RDS - MySQL]
```

## 사용한 AWS 리소스

| 리소스 | 용도 |
|--------|------|
| Amazon S3 | React 클라이언트 정적 웹 호스팅 |
| Amazon EC2 | Express.js API 서버 실행 |
| Amazon RDS (MySQL) | 시험 데이터 저장 |
| AWS Lambda | Bedrock AI 호출 및 문제 생성/해석 처리 |
| Amazon Bedrock (Nova Lite) | AI 모델을 통한 문제 생성 및 해설 |

## 프로젝트 구조

```
├── client/          # React 프론트엔드
│   ├── src/
│   │   ├── App.js   # 메인 컴포넌트 (사이드바 + 메인 레이아웃)
│   │   └── App.css  # 스타일
│   └── .env         # REACT_APP_SERVER_URL 설정
├── server/          # Express 백엔드
│   ├── server.js    # API 서버 (시험 CRUD, Lambda 호출)
│   └── .env         # DB 접속 정보, Lambda URL 설정
└── bedrock-lambda/  # Lambda 함수
    └── lambda_function.py  # Bedrock AI 호출 로직
```

## 실행 방법

### 1. Lambda 배포

- `bedrock-lambda/lambda-package.zip`을 AWS Lambda에 업로드
- 런타임: Python 3.12
- 환경변수: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 설정
- Lambda Function URL 생성 후 URL 복사
- IAM 역할에 `bedrock:InvokeModel` 권한 추가

### 2. EC2 서버 실행

```bash
cd ~/app
npm install
sudo node server.js
```

`server/.env` 필요 항목:
```
DB_HOST=<RDS 엔드포인트>
DB_USER=<DB 사용자>
DB_PASSWORD=<DB 비밀번호>
DB_NAME=<DB 이름>
BEDROCK_LAMBDA_URL=<Lambda Function URL>
```

### 3. 클라이언트 빌드 및 배포

```bash
cd client
npm install
npm run build
```

빌드된 `build/` 폴더를 S3 버킷에 업로드:
```bash
aws s3 sync build/ s3://<버킷이름>/
```

`client/.env` 필요 항목:
```
REACT_APP_SERVER_URL=http://<EC2 퍼블릭 IP>:80
```

## 참고 사항

- EC2 인스턴스가 중지된 경우 재시작이 필요할 수 있습니다.
- EC2 재시작 시 퍼블릭 IP가 변경될 수 있으며, 이 경우 클라이언트 재빌드 및 S3 재배포가 필요합니다.

## 테스트 방법

1. 웹사이트 접속
2. 왼쪽 사이드바에서 "새 시험 만들기" 선택
3. 학습 내용 입력 (예: 아무 교과서 내용 복사 붙여넣기)
4. 문제 수 선택 후 "시험 생성하기" 클릭
5. AI가 문제를 생성하면 자동으로 시험 화면으로 이동
6. 문제 풀고 "답안 제출하기" 클릭
7. 채점 결과 확인 후 "AI 해석 보기"로 해설 확인
