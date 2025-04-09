// 1. 필요한 모듈 가져오기
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // sqlite3 모듈 추가, .verbose()는 디버깅 메시지를 더 자세히 보여줍니다.

// 2. Express 앱 생성 및 미들웨어 설정
const app = express();
app.use(express.json()); // 클라이언트가 보내는 JSON 데이터를 파싱하기 위해 꼭 필요!
app.use(express.static(path.join(__dirname, 'public')));

// 3. 포트 번호 설정
const port = 3000;

// --- 데이터베이스 설정 시작 ---
const dbPath = path.join(__dirname, 'database.db'); // DB 파일 경로 및 이름 지정
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("데이터베이스 연결 오류:", err.message);
  } else {
    console.log("데이터베이스에 성공적으로 연결되었습니다:", dbPath);
    // 데이터베이스 연결 성공 시 테이블 생성 함수 호출
    initializeDatabase();
  }
});

// 데이터베이스 초기화 함수 (테이블 생성)
function initializeDatabase() {
  // serialize: SQL 명령들이 순차적으로 실행되도록 보장합니다.
  db.serialize(() => {
    // Columns 테이블 생성 (IF NOT EXISTS: 이미 테이블이 있으면 생성하지 않음)
    db.run(`CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ord INTEGER UNIQUE NOT NULL  -- 'order'는 예약어일 수 있으므로 'ord' 사용
    )`, (err) => {
      if (err) {
        console.error("Columns 테이블 생성 오류:", err.message);
      } else {
        console.log("Columns 테이블이 준비되었습니다.");
        // 기본 컬럼 데이터 추가 (처음 한 번만 실행됨)
        const defaultColumns = [
            { id: 'daily', title: '매일 할일', ord: 0 },
            { id: 'input', title: '인폼 사항', ord: 1 },
            { id: 'instruction1', title: '지시 사항 1', ord: 2 },
            { id: 'instruction2', title: '지시 사항 2', ord: 3 },
            { id: 'pgm', title: 'PGM 변경 내역', ord: 4 }
        ];
        // INSERT OR IGNORE: id가 이미 존재하면 무시하고 넘어감
        const stmt = db.prepare("INSERT OR IGNORE INTO columns (id, title, ord) VALUES (?, ?, ?)");
        defaultColumns.forEach(col => stmt.run(col.id, col.title, col.ord));
        stmt.finalize(); // Prepare 문 완료
      }
    });

    // Tasks 테이블 생성
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      columnId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      dueDate TEXT,        -- 날짜는 TEXT로 저장 (YYYY-MM-DD)
      assignees TEXT,      -- 쉼표로 구분된 문자열 또는 JSON 문자열
      priority TEXT DEFAULT 'medium',
      tags TEXT,           -- JSON 배열 문자열로 저장 권장
      completed BOOLEAN DEFAULT 0, -- 0: false, 1: true
      createdAt INTEGER DEFAULT (strftime('%s', 'now')) -- 생성 시간 (Unix 타임스탬프)
    )`, (err) => {
      if (err) {
        console.error("Tasks 테이블 생성 오류:", err.message);
      } else {
        console.log("Tasks 테이블이 준비되었습니다.");
      }
    });
  });
}
// --- 데이터베이스 설정 끝 ---

// --- API 엔드포인트 정의 ---

// GET /api/data : 모든 컬럼과 태스크 데이터 가져오기
app.get('/api/data', (req, res) => {
  const data = { columns: [], tasks: [] };
  db.serialize(() => {
    // 1. 컬럼 가져오기 (ord 순서대로)
    db.all("SELECT * FROM columns ORDER BY ord ASC", [], (err, columns) => {
      if (err) {
        console.error("컬럼 조회 오류:", err.message);
        return res.status(500).json({ error: '데이터 조회 중 오류 발생' });
      }
      data.columns = columns;

      // 2. 태스크 가져오기
      db.all("SELECT * FROM tasks ORDER BY createdAt ASC", [], (err, tasks) => {
        if (err) {
          console.error("태스크 조회 오류:", err.message);
          return res.status(500).json({ error: '데이터 조회 중 오류 발생' });
        }
        // DB에서 읽어온 데이터 처리 (tags 파싱, completed 변환)
        data.tasks = tasks.map(task => ({
          ...task,
          tags: task.tags ? JSON.parse(task.tags) : [], // JSON 문자열 -> 배열
          completed: task.completed === 1 // 1 -> true, 0 -> false
        }));

        // 3. 모든 데이터 조회 완료 후 응답 전송
        res.json(data);
      });
    });
  });
});

// POST /api/tasks : 새 태스크 추가
app.post('/api/tasks', (req, res) => {
  const { id, columnId, title, description, dueDate, assignees, priority, tags } = req.body;

  if (!id || !columnId || !title) {
    return res.status(400).json({ error: 'id, columnId, title 필드는 필수입니다.' });
  }

  const sql = `INSERT INTO tasks (id, columnId, title, description, dueDate, assignees, priority, tags, completed)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  // 배열인 tags를 JSON 문자열로 변환, completed는 기본값 0(false)
  const params = [
    id, columnId, title, description, dueDate, assignees,
    priority || 'medium', tags ? JSON.stringify(tags) : null, 0
  ];

  db.run(sql, params, function(err) { // 여기서 일반 함수 사용해야 this.lastID 등을 쓸 수 있음 (지금은 필요없음)
    if (err) {
      console.error("태스크 추가 오류:", err.message);
      return res.status(500).json({ error: '태스크 추가 중 오류 발생' });
    }
    console.log(`새 태스크 추가됨: ${id}`);
    // 성공 시 추가된 태스크 정보 반환 (tags 포함)
    const newTask = { ...req.body, completed: false, tags: tags || [] };
    res.status(201).json(newTask);
  });
});

// PUT /api/tasks/:id : 태스크 수정
app.put('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const { columnId, title, description, dueDate, assignees, priority, tags, completed } = req.body;

  // 수정할 필드만 동적으로 구성 (undefined가 아닌 값만 업데이트)
  const fieldsToUpdate = [];
  const params = [];

  if (columnId !== undefined) { fieldsToUpdate.push("columnId = ?"); params.push(columnId); }
  if (title !== undefined) { fieldsToUpdate.push("title = ?"); params.push(title); }
  if (description !== undefined) { fieldsToUpdate.push("description = ?"); params.push(description); }
  if (dueDate !== undefined) { fieldsToUpdate.push("dueDate = ?"); params.push(dueDate); }
  if (assignees !== undefined) { fieldsToUpdate.push("assignees = ?"); params.push(assignees); }
  if (priority !== undefined) { fieldsToUpdate.push("priority = ?"); params.push(priority); }
  if (tags !== undefined) { fieldsToUpdate.push("tags = ?"); params.push(tags ? JSON.stringify(tags) : null); } // JSON 변환
  if (completed !== undefined) { fieldsToUpdate.push("completed = ?"); params.push(completed ? 1 : 0); } // Boolean -> 0/1

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ error: '수정할 내용이 없습니다.' });
  }

  params.push(taskId); // WHERE 절에 사용할 taskId 마지막에 추가

  const sql = `UPDATE tasks SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      console.error(`태스크 수정 오류 (ID: ${taskId}):`, err.message);
      return res.status(500).json({ error: '태스크 수정 중 오류 발생' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '수정할 태스크를 찾을 수 없습니다.' });
    }
    console.log(`태스크 수정됨: ${taskId}`);
    // 성공 시 수정된 태스크 정보 반환 (변경된 내용 반영)
    const updatedTask = { id: taskId, ...req.body }; // 요청 본문으로 간단히 응답
    res.json(updatedTask);
  });
});

// DELETE /api/tasks/:id : 태스크 삭제
app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const sql = "DELETE FROM tasks WHERE id = ?";

  db.run(sql, [taskId], function(err) {
    if (err) {
      console.error(`태스크 삭제 오류 (ID: ${taskId}):`, err.message);
      return res.status(500).json({ error: '태스크 삭제 중 오류 발생' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: '삭제할 태스크를 찾을 수 없습니다.' });
    }
    console.log(`태스크 삭제됨: ${taskId}`);
    res.status(200).json({ message: '태스크가 성공적으로 삭제되었습니다.', id: taskId }); // 성공 메시지와 ID 반환
  });
});

// --- API 엔드포인트 정의 끝 ---

// 6. 서버 시작
app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
  // 고정 IP 설정 시 안내 메시지 추가 가능
});

// 서버 종료 시 데이터베이스 연결 닫기 (Graceful Shutdown)
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('데이터베이스 연결이 닫혔습니다.');
    process.exit(0);
  });
});