require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const axios = require("axios");
const cors = require("cors");

const app = express();
const port = 80;

app.use(cors());
app.use(express.json());

let dbConnection = null;

const connectToDatabase = () => {
  try {
    const requiredEnvVars = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
    const missingEnvVars = requiredEnvVars.filter(
      (envVar) => !process.env[envVar],
    );

    if (missingEnvVars.length > 0) {
      console.error("필수 환경변수 누락:", missingEnvVars.join(", "));
      return null;
    }

    const connection = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    return new Promise((resolve, reject) => {
      connection.connect(async (err) => {
        if (err) {
          console.error("데이터베이스 연결 실패:", err);
          reject(err);
          return;
        }
        console.log("데이터베이스 연결 성공");
        try {
          await createExamsTable(connection);
          dbConnection = connection;
          resolve(connection);
        } catch (error) {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error("데이터베이스 연결 중 오류:", error);
    return Promise.reject(error);
  }
};

const createExamsTable = (connection) => {
  return new Promise((resolve, reject) => {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS exams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_text TEXT NOT NULL,
        questions JSON,
        status ENUM('generating', 'ready', 'error') DEFAULT 'generating',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    connection.query(createTableQuery, (err, result) => {
      if (err) {
        console.error("테이블 생성 중 오류:", err);
        reject(err);
        return;
      }
      console.log("Exams 테이블 준비 완료");
      resolve(result);
    });
  });
};

const checkDbConnection = (req, res, next) => {
  if (!dbConnection) {
    return res.status(503).json({
      error: "데이터베이스 연결 실패",
      message: "현재 데이터베이스 서비스를 이용할 수 없습니다.",
    });
  }
  next();
};

const callBedrockLambda = async (payload) => {
  if (!process.env.BEDROCK_LAMBDA_URL) {
    throw new Error("Bedrock Lambda URL이 설정되지 않았습니다");
  }
  try {
    const response = await axios.post(process.env.BEDROCK_LAMBDA_URL, payload);
    return response.data;
  } catch (error) {
    console.error("Bedrock Lambda 호출 중 오류:", error);
    throw new Error("Bedrock Lambda 호출 실패");
  }
};

// 기본 경로
app.get("/", (req, res) => {
  res.json({
    message: "모의시험 서버 실행 중",
    status: {
      database: dbConnection ? "연결됨" : "연결 안됨",
      bedrock_lambda_url: process.env.BEDROCK_LAMBDA_URL ? "설정됨" : "설정 안됨",
    },
  });
});

// 시험 생성 요청
app.post("/exams", checkDbConnection, async (req, res) => {
  const { content, questionCount } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "학습 내용을 입력해주세요" });
  }

  const sql = "INSERT INTO exams (source_text) VALUES (?)";
  dbConnection.query(sql, [content], async (err, result) => {
    if (err) {
      console.error("시험 저장 중 오류:", err);
      return res.status(500).json({ error: "시험 저장 실패" });
    }

    const examId = result.insertId;
    res.status(201).json({ message: "시험 생성 요청 완료", id: examId });

    // 비동기로 Lambda 호출
    try {
      await callBedrockLambda({
        action: "generate_exam",
        content,
        examId,
        questionCount: questionCount || 5,
      });
    } catch (error) {
      console.error("문제 생성 실패:", error);
      const updateSql = "UPDATE exams SET status = 'error' WHERE id = ?";
      dbConnection.query(updateSql, [examId]);
    }
  });
});

// 시험 목록 조회
app.get("/exams", checkDbConnection, async (req, res) => {
  const sql = "SELECT * FROM exams ORDER BY created_at DESC";
  dbConnection.query(sql, (err, results) => {
    if (err) {
      console.error("시험 조회 중 오류:", err);
      return res.status(500).json({ error: "시험 조회 실패" });
    }
    res.json(results);
  });
});

// 특정 시험 조회
app.get("/exams/:id", checkDbConnection, async (req, res) => {
  const { id } = req.params;
  const sql = "SELECT * FROM exams WHERE id = ?";
  dbConnection.query(sql, [id], (err, results) => {
    if (err) {
      console.error("시험 조회 중 오류:", err);
      return res.status(500).json({ error: "시험 조회 실패" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "시험을 찾을 수 없습니다" });
    }
    res.json(results[0]);
  });
});

// 시험 삭제
app.delete("/exams/:id", checkDbConnection, async (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM exams WHERE id = ?";
  dbConnection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("시험 삭제 중 오류:", err);
      return res.status(500).json({ error: "시험 삭제 실패" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "해당 시험을 찾을 수 없습니다" });
    }
    res.json({ message: "시험이 삭제되었습니다" });
  });
});

// 전체 시험 삭제
app.delete("/exams", checkDbConnection, async (req, res) => {
  const sql = "DELETE FROM exams";
  dbConnection.query(sql, (err, result) => {
    if (err) {
      console.error("전체 삭제 중 오류:", err);
      return res.status(500).json({ error: "전체 삭제 실패" });
    }
    res.json({ message: "모든 시험이 삭제되었습니다", deletedCount: result.affectedRows });
  });
});

// AI 해석 요청
app.post("/exams/:id/explain", checkDbConnection, async (req, res) => {
  const { question, options, answer, questionIndex } = req.body;
  const { id } = req.params;

  if (!question || options === undefined || answer === undefined) {
    return res.status(400).json({ error: "문제 정보가 필요합니다" });
  }

  try {
    const aiResponse = await callBedrockLambda({
      action: "explain_answer",
      question,
      options,
      answer,
      examId: id,
      questionIndex,
    });
    res.json({ explanation: aiResponse });
  } catch (error) {
    console.error("해석 요청 실패:", error);
    res.status(500).json({ error: "AI 해석 요청 실패" });
  }
});

// 에러 처리
process.on("uncaughtException", (error) => {
  console.error("처리되지 않은 에러:", error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("처리되지 않은 Promise 거부:", error);
  process.exit(1);
});

// 서버 시작
const startServer = async () => {
  try {
    await connectToDatabase();
    app.listen(port, () => {
      console.log("\n=== 서버 상태 ===");
      console.log(`포트: ${port}`);
      console.log(
        `Bedrock Lambda URL: ${process.env.BEDROCK_LAMBDA_URL ? "설정됨 ✅" : "설정 안됨 ⚠️"}`
      );
      if (!process.env.BEDROCK_LAMBDA_URL) {
        console.log("※ Lambda URL이 설정되지 않으면 AI 기능을 사용할 수 없습니다.");
      }
      console.log("=================\n");
    });
  } catch (error) {
    console.error("서버 시작 실패:", error);
    process.exit(1);
  }
};

startServer();
