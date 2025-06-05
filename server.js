require('dotenv').config(); // .env 파일 로드. 가능한 최상단에 위치

// 1. 필요한 모듈 가져오기
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // sqlite3 모듈 추가, .verbose()는 디버깅 메시지를 더 자세히 보여줍니다.
const jwt = require('jsonwebtoken'); // JWT 모듈 추가
const cookieParser = require('cookie-parser'); // 쿠키 파싱 모듈 추가
const csrf = require('csurf'); // CSRF protection
const fs = require('fs'); // 파일 시스템 모듈 추가
const bcrypt = require('bcrypt'); // bcrypt 라이브러리 추가
const { defaultUsers } = require('./config'); // config.js에서 defaultUsers 가져오기
const crypto = require('crypto'); // crypto 모듈 추가
// HTTPS 모듈 추가
const https = require('https');
// node-forge 모듈 추가
const forge = require('node-forge');

// JWT 비밀 키 설정 (환경 변수에서 가져오기)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("치명적 오류: JWT_SECRET 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.");
  process.exit(1); // 비밀 키 없이는 서버 실행 중단
}
const JWT_EXPIRES_IN = '4h'; // 토큰 유효 기간 (4시간) 30분 = 30m

// 2. Express 앱 생성 및 미들웨어 설정
const app = express();
app.disable('x-powered-by'); // X-Powered-By 헤더 비활성화
app.use(express.json()); // 클라이언트가 보내는 JSON 데이터를 파싱하기 위해 꼭 필요!
app.use(cookieParser()); // 쿠키 파싱 미들웨어 추가


// HTTP to HTTPS Redirection Middleware
// This should be placed fairly early, but after static file serving if those don't need HTTPS.
// However, for full security, usually all traffic goes to HTTPS.
// Placing it after cookie parser and before HSTS/CSP seems reasonable.
app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === "production";
  // Check for http protocol or x-forwarded-proto indicating http
  const isHttp = req.protocol === "http" ||
                 (req.headers["x-forwarded-proto"] && req.headers["x-forwarded-proto"].split(',')[0].trim().toLowerCase() === "http");

  if (isProduction && isHttp && typeof sslOptions !== 'undefined' && sslOptions && sslOptions.key && sslOptions.cert) {
    // req.hostname might not include the port if behind a proxy that sets x-forwarded-host.
    // req.headers.host includes hostname:port if port is non-standard for HTTP/HTTPS.
    // Let's ensure we use the correct hostname and the globally defined httpsPort.
    const host = req.hostname; // Use req.hostname for cleaner host, proxy should set x-forwarded-host
    const httpsRedirectUrl = `https://${host}${httpsPort === 443 ? "" : `:${httpsPort}`}${req.originalUrl}`;

    console.log(`Redirecting HTTP to HTTPS: ${req.protocol}://${req.headers.host}${req.originalUrl} -> ${httpsRedirectUrl}`);
    return res.redirect(301, httpsRedirectUrl);
  }
  next();
});


// Middleware to set no-cache headers
const setNoCacheHeaders = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store'); // Often used with CDNs, good to have
  next();
};

app.use(express.static(path.join(__dirname, 'public')));

// HSTS 헤더 설정 미들웨어
app.use((req, res, next) => {
  if (req.secure) { // HTTPS 연결인 경우에만 HSTS 헤더 설정
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains' // 1년 동안 HSTS 적용, 서브도메인 포함
    );
  }
  next();
});

// CSP 헤더 설정 미들웨어
app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';
  let scriptSrc = "'self'"; // Default to 'self'
  let connectSrc = "'self'"; // Default to 'self'

  if (!isProduction) {
    // Allow development server for scripts and connections in non-production
    scriptSrc += " http://127.0.0.1:1337";
    connectSrc += " http://127.0.0.1:1337";
  }

  // Construct the CSP string carefully
  const cspValue = `default-src 'self'; \
script-src ${scriptSrc}; \
style-src 'self'; \
font-src 'self'; \
connect-src ${connectSrc}; \
img-src 'self' data:; \
object-src 'none'; \
frame-ancestors 'none'; \
base-uri 'self'; \
form-action 'self'; \
upgrade-insecure-requests; \
block-all-mixed-content;`

  res.setHeader(
    'Content-Security-Policy',
    cspValue
  );
  next();
});

// CORS 설정 추가
app.use((req, res, next) => {
  // 요청을 보낸 클라이언트의 Origin 가져오기
  const origin = req.headers.origin;

  // 허용할 Origin 목록 (필요에 따라 PC의 IP 주소 등으로 변경)
  // 예: const allowedOrigins = ['http://localhost:3000', 'http://192.168.0.10:3000'];
  // 여기서는 요청한 Origin을 그대로 허용하도록 설정 (주의: 프로덕션에서는 특정 Origin만 허용하는 것이 안전)
  if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
  }

  // Credentials (쿠키 등) 허용 설정 추가
  res.header('Access-Control-Allow-Credentials', 'true');

  // 허용할 헤더
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  // 허용할 HTTP 메서드
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  // preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// 3. 포트 번호 설정
const port = 3000;
const httpsPort = 8443; // HTTPS 포트(443에서 변경)

// SSL 인증서 생성 함수 (node-forge 사용)
function generateSelfSignedCertificate() {
  console.log('자체 서명 인증서 생성 중...');

  // 인증서 파일 경로
  const certDir = path.join(__dirname, 'ssl');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');

  // 인증서 디렉토리가 있는지 확인
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  // 인증서가 이미 존재하는지 확인
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('SSL 인증서가 이미 존재합니다.');
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8')
    };
  }

  try {
    // RSA 키 쌍 생성
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // 인증서 생성
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + crypto.randomBytes(19).toString('hex');

    // 유효기간 설정 (1년)
    const now = new Date();
    cert.validity.notBefore = now;
    const expiry = new Date();
    expiry.setFullYear(now.getFullYear() + 1);
    cert.validity.notAfter = expiry;

    // 주체 속성 설정
    const attrs = [
      { name: 'commonName', value: 'localhost' },
      { name: 'countryName', value: 'KR' },
      { shortName: 'ST', value: 'Seoul' },
      { name: 'localityName', value: 'Seoul' },
      { name: 'organizationName', value: 'My Dashboard' },
      { shortName: 'OU', value: 'Development' }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs); // 자체 서명이므로 발급자와 주체가 동일

    // 확장 설정
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: false
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' }, // DNS
          { type: 7, ip: '127.0.0.1' } // IP
        ]
      }
    ]);

    // 자체 서명
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // PEM 형식으로 변환
    const certPem = forge.pki.certificateToPem(cert);
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // 파일로 저장
    fs.writeFileSync(keyPath, keyPem);
    fs.writeFileSync(certPath, certPem);

    console.log('SSL 인증서 생성 완료');

    return {
      key: keyPem,
      cert: certPem
    };
  } catch (error) {
    console.error('SSL 인증서 생성 중 오류:', error);
    return null;
  }
}

// SSL 인증서 가져오기 또는 생성하기
let sslOptions = null;
try {
  sslOptions = generateSelfSignedCertificate();
} catch (error) {
  console.error('SSL 인증서를 생성할 수 없습니다:', error);
}

// SSL 인증서 확인
if (!sslOptions || !sslOptions.key || !sslOptions.cert) {
  console.error(`
===============================================================
  SSL 인증서 파일이 없거나 올바르지 않습니다. HTTPS를 사용하려면 다음 단계를 따라주세요:

  1. 'ssl' 디렉토리를 확인하세요: mkdir ssl

  2. Node.js의 forge 모듈을 사용하여 자동으로 인증서를 생성합니다.

  3. 생성 후 서버를 다시 시작하세요.

  * 참고: 현재는 HTTP 서버만 시작됩니다.
===============================================================
  `);
}

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
        console.error(`Columns 테이블 생성 오류:`, err.message);
      } else {
        // console.log("Columns 테이블이 준비되었습니다.");
        // console.log(`[${new Date().toISOString()}] Columns 테이블 생성 성공 또는 이미 존재.`); // 로그 삭제
        // 기본 컬럼 데이터 추가 (처음 한 번만 실행됨)
        const defaultColumns = [
            { id: 'gotowork', title: '지시 사항', ord: 0 },
            { id: 'information', title: '특이 사항', ord: 1 },
            { id: 'todowork', title: '할일', ord: 2 },
            { id: 'inprogress', title: '진행중', ord: 3 },
            { id: 'welldone', title: '완료', ord: 4 }
        ];
        // INSERT OR IGNORE: id가 이미 존재하면 무시하고 넘어감
        const stmt = db.prepare("INSERT OR IGNORE INTO columns (id, title, ord) VALUES (?, ?, ?)");
        defaultColumns.forEach(col => stmt.run(col.id, col.title, col.ord));
        stmt.finalize(); // Prepare 문 완료
      }
    });

    // Users 테이블 생성 (사번 정보 저장)
    // console.log(`[${new Date().toISOString()}] Users 테이블 생성 시도...`); // 로그 삭제
    db.run(`CREATE TABLE IF NOT EXISTS users (
      employeeId TEXT PRIMARY KEY,
      name TEXT,
      passwordHash TEXT, -- 비밀번호 해시 컬럼은 이미 추가됨
      mustChangePassword BOOLEAN DEFAULT 1 -- 비밀번호 변경 필요 여부 컬럼 추가 (기본값 1: TRUE)
    )`, (err) => {
      // console.log(`[${new Date().toISOString()}] Users 테이블 생성 콜백 시작.`); // 로그 삭제
      if (err) {
        console.error(`Users 테이블 생성 오류:`, err.message); // 타임스탬프 제거
      } else {
        // console.log(`[${new Date().toISOString()}] Users 테이블 생성 성공 또는 이미 존재.`); // 로그 삭제

        // --- 비밀번호 컬럼 추가 (users 테이블 생성 후 실행되도록) ---
        // console.log(`[${new Date().toISOString()}] passwordHash 컬럼 추가 시도...`); // 로그 삭제
        db.run('ALTER TABLE users ADD COLUMN mustChangePassword BOOLEAN DEFAULT 1', (alterErr) => {
          // console.log(`[${new Date().toISOString()}] passwordHash 컬럼 추가 콜백 시작.`); // 로그 삭제
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            console.error("users 테이블에 mustChangePassword 컬럼 추가 중 오류 발생:", alterErr.message);
            return;
          }

          // --- 기본 사용자 데이터 추가 (컬럼 추가 확인 후) ---
          if (defaultUsers && defaultUsers.length > 0) {
            const insertStmt = db.prepare("INSERT OR IGNORE INTO users (employeeId, name) VALUES (?, ?)");
            defaultUsers.forEach(user => {
              if (user.employeeId && user.name) {
                insertStmt.run(user.employeeId, user.name);
              }
            });
            insertStmt.finalize((finalizeErr) => {
              if (finalizeErr) {
                console.error(`기본 사용자 추가 finalize 오류:`, finalizeErr); // 타임스탬프 제거
                // 오류 발생 시 반환
                return;
              }

              // --- 임시 비밀번호 생성 및 해시 업데이트 ---
              const saltRounds = 10;
              const updateStmt = db.prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 1 WHERE employeeId = ? AND passwordHash IS NULL");
              let updatesAttempted = 0;
              let updatesCompleted = 0;
              const totalUsersToInitialize = defaultUsers.length; // 모든 기본 사용자가 대상

              if (totalUsersToInitialize === 0) {
                console.log("초기화할 기본 사용자가 없습니다.");
                updateStmt.finalize();
                return;
              }

              console.log(`${totalUsersToInitialize}명의 기본 사용자에 대한 초기 비밀번호 설정을 확인/시도합니다.`);

              defaultUsers.forEach(user => {
                if (user.employeeId) {
                  // DB에서 현재 passwordHash 값 확인
                  db.get("SELECT passwordHash FROM users WHERE employeeId = ?", [user.employeeId], (getErr, row) => {
                    updatesAttempted++;
                    if (getErr) {
                      console.error(`사용자 ${user.employeeId}의 passwordHash 조회 오류:`, getErr.message);
                    } else if (row && row.passwordHash === null) {
                      // passwordHash가 NULL인 경우에만 임시 비밀번호 생성 및 업데이트
                      try {
                        // 강력한 임시 비밀번호 생성 (예: 12자리 랜덤 문자열)
                        const tempPassword = crypto.randomBytes(9).toString('base64').replace(/[/+=]/g, '').substring(0, 12);

                        if (process.env.NODE_ENV !== 'production') {
                          console.log(`*** 임시 비밀번호 생성 *** 사용자: ${user.employeeId} (${user.name}), 임시 비밀번호: ${tempPassword}`);
                        }

                        const hashedPassword = bcrypt.hashSync(tempPassword, saltRounds);

                        updateStmt.run(hashedPassword, user.employeeId, function(updateErr) {
                          if (updateErr) {
                            console.error(`사용자 ${user.employeeId}의 임시 비밀번호 해시 업데이트 오류:`, updateErr.message);
                          } else if (this.changes > 0) {
                            console.log(`사용자 ${user.employeeId}의 임시 비밀번호가 성공적으로 설정되었습니다.`);
                          }
                          // this.changes === 0 경우는 거의 없지만 로깅은 생략
                        });
                      } catch (hashError) {
                        console.error(`사용자 ${user.employeeId}의 임시 비밀번호 처리 중 오류 발생:`, hashError);
                      }
                    } // else if (row && row.passwordHash !== null) { // 이미 해시가 있으면 아무 작업 안함 }

                    // 모든 사용자 확인 완료 시 finalize
                    if (updatesAttempted === totalUsersToInitialize) {
                       updateStmt.finalize((finalUpdateErr) => {
                         if (finalUpdateErr) console.error(`비밀번호 업데이트 finalize 오류:`, finalUpdateErr);
                         else console.log(`기본 사용자 초기 비밀번호 설정 확인/시도 완료.`);
                       });
                    }
                  });
                } else {
                   updatesAttempted++; // employeeId 없는 경우도 카운트하여 finalize 조건 맞춤
                    if (updatesAttempted === totalUsersToInitialize) {
                       updateStmt.finalize((finalUpdateErr) => {
                         if (finalUpdateErr) console.error(`비밀번호 업데이트 finalize 오류:`, finalUpdateErr);
                         else console.log(`기본 사용자 초기 비밀번호 설정 확인/시도 완료.`);
                       });
                    }
                }
              }); // forEach 끝
             }); // insertStmt.finalize 끝
           } else {
             console.log("추가/업데이트할 기본 사용자 데이터가 없습니다.");
           }
        }); // ALTER TABLE 콜백 끝
      }
    }); // CREATE TABLE users 콜백 끝

    // Tasks 테이블 생성
    // console.log(`[${new Date().toISOString()}] Tasks 테이블 생성 시도...`); // 로그 삭제
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
      creatorId TEXT,      -- 태스크 작성자의 사번
      createdAt INTEGER DEFAULT (strftime('%s', 'now')) -- 생성 시간 (Unix 타임스탬프)
    )`, (err) => {
      if (err) {
        console.error(`Tasks 테이블 생성 오류:`, err.message); // 타임스탬프 제거
      } else {
        // console.log("Tasks 테이블이 준비되었습니다.");
        // console.log(`[${new Date().toISOString()}] Tasks 테이블 생성 성공 또는 이미 존재.`); // 로그 삭제
      }
    });
  });
}
// --- 데이터베이스 설정 끝 ---

// --- 인증 미들웨어 정의 ---
const authenticateToken = (req, res, next) => {
  // 쿠키에서 JWT 토큰 가져오기
  let token = req.cookies.token;


  // 쿠키에 토큰이 없으면 Authorization 헤더에서 확인
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
    console.log(`[인증 디버깅] Authorization 헤더에서 토큰 발견`);
  }

  if (!token) {
    console.log(`[인증 디버깅] 토큰이 없음: 쿠키 및 Authorization 헤더 모두 토큰이 없음`);
    // API 요청에 대한 처리 유지 (JSON 응답)
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: '인증이 필요합니다. 로그인해주세요.' });
    }
    // API 요청이 아니면 다음 미들웨어(여기서는 authenticatePage)로 넘기거나,
    // 여기서 바로 리디렉션할 수도 있지만, 페이지 전용 미들웨어를 사용하는 것이 더 명확합니다.
    // 여기서는 일단 에러 없이 다음으로 넘어가도록 수정 (하단의 authenticatePage에서 처리)
    // 또는, 여기서 직접 리디렉션을 해도 됩니다. 여기서는 명확성을 위해 authenticatePage 에서 처리하겠습니다.
     return res.status(401).json({ error: '인증 토큰 없음 (API)' }); // API용 401 유지
  }

  try {
    // 토큰 검증
    const decoded = jwt.verify(token, JWT_SECRET);

    // 토큰 소유자 (사용자 ID)
    const { employeeId } = decoded;

    // 토큰이 해당 사용자의 최신 활성 토큰인지 확인
    if (!activeTokens.isTokenValid(employeeId, token)) {
      console.log(`[인증 디버깅] 사용자 ${employeeId}의 토큰이 다른 세션에 의해 무효화됨`);

      // 쿠키 삭제 (이전 세션 토큰)
      res.clearCookie('token');

      // API 요청 시 다른 세션에 의해 로그아웃됨을 알림
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({
          error: '다른 위치에서 로그인하여 현재 세션이 종료되었습니다. 다시 로그인해주세요.',
          sessionExpired: true
        });
      }

      // API가 아닌 경우 (HTML 페이지 요청)는 authenticatePage에서 처리하도록 401 반환
      return res.status(401).json({
        error: '세션 만료됨 (다른 로그인에 의해)',
        sessionExpired: true
      });
    }

    // 검증된 사용자 정보를 요청 객체에 추가
    req.user = decoded;
    next(); // 다음 미들웨어로 진행
  } catch (err) {
    console.error(`[인증 디버깅] API 토큰 검증 오류: ${err.message}, 토큰 길이: ${token?.length || 0}`);
    // API 요청에 대한 처리 유지 (JSON 응답)
    if (req.path.startsWith('/api/')) {
      // 만료/유효하지 않은 토큰의 경우 쿠키를 삭제하는 것이 좋습니다.
      res.clearCookie('token');
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
     // API가 아닌 경우 (여기서는 /index.html 접근 시), 아래 authenticatePage 에서 처리하도록 next() 대신 오류를 반환하거나 다른 처리가 필요합니다.
     // 하지만 authenticateToken은 API 전용으로 남겨두는 것이 좋습니다.
     res.clearCookie('token'); // 잘못된 토큰 쿠키 삭제
     return res.status(403).json({ error: '유효하지 않은 토큰 (API)' }); // API용 403 유지
  }
};

// 페이지 접근 제어 미들웨어 (HTML 페이지용)
const authenticatePage = (req, res, next) => {
  // 쿠키에서 JWT 토큰 가져오기
  let token = req.cookies.token;

  // 쿠키에 토큰이 없으면 Authorization 헤더에서 확인
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
    console.log('[authenticatePage] Authorization 헤더에서 토큰 발견'); // 로그 추가
  }

  if (!token) {
    // 토큰이 없으면 로그인 페이지로 리디렉션
    console.log('[authenticatePage] 토큰 없음. 로그인 페이지로 리디렉션.'); // 로그 추가
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.redirect('/login.html');
  }
  try {
    // 토큰 검증
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[authenticatePage] 토큰 검증 성공. 사용자:', decoded.employeeId); // 로그 추가

    // 토큰 소유자 (사용자 ID)
    const { employeeId } = decoded;

    // 토큰이 해당 사용자의 최신 활성 토큰인지 확인
    if (!activeTokens.isTokenValid(employeeId, token)) {
      console.log(`[authenticatePage] 사용자 ${employeeId}의 토큰이 다른 세션에 의해 무효화됨`);

      // 쿠키 삭제 (이전 세션 토큰)
      res.clearCookie('token');

      // 로그인 페이지로 리디렉션 (다른 세션에 의해 로그아웃됨을 쿼리 파라미터로 알림)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.redirect('/login.html?sessionExpired=true');
    }

    req.user = decoded; // 사용자 정보 추가 (선택 사항, 페이지 로딩 시 필요하면 사용)
    next(); // 인증 성공, 다음 핸들러로 진행 (페이지 제공)
  } catch (err) {
    // 토큰이 유효하지 않으면 (만료 포함)
    console.error(`[authenticatePage] 페이지 접근 토큰 검증 오류: ${err.message}. 로그인 페이지로 리디렉션.`); // 에러 메시지 로그 강화
    res.clearCookie('token'); // 잘못된 토큰 쿠키 삭제
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.redirect('/login.html'); // 로그인 페이지로 리디렉션
  }
};

// 루트 경로('/') 접근 시 로그인 확인 후 index.html 또는 login.html로 라우팅
// 기존 로직을 authenticatePage 미들웨어로 대체
app.get('/', authenticatePage, (req, res) => {
  // authenticatePage를 통과하면 인증된 사용자이므로 index.html 제공
  // 캐시 제어 헤더 추가
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// CSRF Protection Setup
// Important: CSRF middleware must come after cookie parser and body parser (express.json)
// And before any routes that need protection.
const csrfProtection = csrf({ cookie: true });

// Endpoint to get CSRF token
// This route itself needs csrfProtection to generate req.csrfToken()
app.get("/api/csrf-token", csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Apply CSRF protection to all API routes that change state.
// csurf middleware, when applied, automatically checks POST, PUT, DELETE, PATCH.
// It does NOT check GET, HEAD, OPTIONS by default.
// So, applying it broadly to '/api' path is fine.
app.use('/api', csrfProtection);


app.use('/api', setNoCacheHeaders); // Apply no-cache headers to all API routes
// --- API 엔드포인트 정의 ---

// 인증 확인 API (클라이언트에서 로그인 상태 확인용)
app.get('/api/me', authenticateToken, (req, res) => {
  // authenticateToken 미들웨어를 통과했다면 req.user에 사용자 정보가 있음
  res.json({ user: req.user, isAuthenticated: true });
});

// 로그인 상태 확인 API (인증 미들웨어 없이 호출 가능)
app.get('/api/auth-status', (req, res) => {
  // 쿠키에서 JWT 토큰 가져오기
  let token = req.cookies.token;

  // 쿠키에 토큰이 없으면 Authorization 헤더에서 확인
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    // 토큰이 없으면 인증되지 않음 상태 반환 (에러가 아님)
    return res.json({ isAuthenticated: false });
  }

  try {
    // 토큰 검증
    const decoded = jwt.verify(token, JWT_SECRET);
    // 검증된 사용자 정보 반환
    res.json({
      isAuthenticated: true,
      user: { employeeId: decoded.employeeId, name: decoded.name }
    });
  } catch (err) {
    // 토큰이 유효하지 않으면 인증되지 않음 상태 반환
    res.json({ isAuthenticated: false, error: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
});

// 로그아웃 API
app.post('/api/logout', authenticateToken, (req, res) => {
  // 사용자 ID 가져오기 (인증 미들웨어를 통과했으므로 req.user 사용 가능)
  const userId = req.user ? req.user.employeeId : 'unknown';

  // 로그아웃 로그 기록
  logTaskActivity('LOGOUT', null, userId, req.ip);

  // 활성 토큰에서 제거
  activeTokens.removeUserToken(userId);

  // 토큰 쿠키 삭제
  res.clearCookie('token');
  // 캐시 방지 헤더 설정
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ message: '로그아웃 되었습니다.' });
});

// GET /api/data : 모든 컬럼과 태스크 데이터 가져오기 (인증 필요)
app.get('/api/data', authenticateToken, (req, res) => {
  const data = { columns: [], tasks: [] };
  db.serialize(() => {
    // 1. 컬럼 가져오기 (ord 순서대로)
    db.all("SELECT * FROM columns ORDER BY ord ASC", [], (err, columns) => {
      if (err) {
        console.error(`컬럼 조회 오류:`, err.message); // 타임스탬프 제거
        return res.status(500).json({ error: '데이터 조회 중 오류 발생' });
      }
      data.columns = columns;

      // 2. 태스크 가져오기
      db.all(`SELECT t.*, u.name as creatorName
              FROM tasks t
              LEFT JOIN users u ON t.creatorId = u.employeeId
              ORDER BY t.createdAt ASC`, [], (err, tasks) => {
        if (err) {
          console.error(`태스크 조회 오류:`, err.message); // 타임스탬프 제거
          return res.status(500).json({ error: '데이터 조회 중 오류 발생' });
        }
        // DB에서 읽어온 데이터 처리 (tags 파싱, completed 변환)
        data.tasks = tasks.map(task => ({
          ...task,
          tags: task.tags ? JSON.parse(task.tags) : [], // JSON 문자열 -> 배열
          completed: task.completed === 1 // 1 -> true, 0 -> false
        }));

        // 3. 모든 데이터 조회 완료 후 응답 전송
        logTaskActivity('VIEW_ALL_DATA', null, req.user ? req.user.employeeId : 'unknown_user_view_data', req.ip);
        res.json(data);
      });
    });
  });
});

// POST /api/tasks : 새 태스크 추가 (인증 필요)
app.post('/api/tasks', authenticateToken, (req, res) => {
  const { id, columnId, title, description, dueDate, assignees, priority, tags } = req.body;

  if (!id || !columnId || !title) {
    return res.status(400).json({ error: 'id, columnId, title 필드는 필수입니다.' });
  }

  // 인증된 사용자의 사번 가져오기
  const creatorId = req.user.employeeId;

  const sql = `INSERT INTO tasks (id, columnId, title, description, dueDate, assignees, priority, tags, completed, creatorId)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  // 배열인 tags를 JSON 문자열로 변환, completed는 기본값 0(false)
  const params = [
    id, columnId, title, description, dueDate, assignees,
    priority || 'medium', tags ? JSON.stringify(tags) : null, 0, creatorId
  ];

  db.run(sql, params, function(err) { // 여기서 일반 함수 사용해야 this.lastID 등을 쓸 수 있음 (지금은 필요없음)
    if (err) {
      console.error(`태스크 추가 오류:`, err.message); // 타임스탬프 제거
      return res.status(500).json({ error: '태스크 추가 중 오류 발생' });
    }
    // console.log(`새 태스크 추가됨: ${id} (작성자: ${creatorId})`); // 주석 처리

    // 태스크 추가 로그 기록
    logTaskActivity('ADD', id, creatorId, req.ip);

    // 작성자 이름 조회
    db.get("SELECT name FROM users WHERE employeeId = ?", [creatorId], (err, user) => {
      if (err) {
        console.error(`작성자 조회 오류:`, err.message); // 타임스탬프 제거
        // 오류가 발생해도 태스크는 이미 추가되었으므로 계속 진행
      }

      // 성공 시 추가된 태스크 정보 반환 (tags 포함)
      const newTask = {
        ...req.body,
        completed: false,
        tags: tags || [],
        creatorId,
        creatorName: user ? user.name : null
      };
      res.status(201).json(newTask);
    });
  });
});

// PUT /api/tasks/:id : 태스크 수정 (인증 필요)
app.put('/api/tasks/:id', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const currentUserId = req.user.employeeId; // 현재 로그인한 사용자 ID
  const { columnId, title, description, dueDate, assignees, priority, tags, completed } = req.body;

  // 1. 먼저 태스크를 조회하여 작성자 ID를 가져옵니다.
  db.get("SELECT creatorId FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err) {
      console.error(`태스크 조회 오류 (수정 전 확인, ID: ${taskId}):`, err.message); // 타임스탬프 제거
      return res.status(500).json({ error: '태스크 정보 조회 중 오류 발생' });
    }

    if (!task) {
      return res.status(404).json({ error: '수정할 태스크를 찾을 수 없습니다.' });
    }

    // 2. 작성자와 현재 사용자가 다른 경우 권한 없음 응답
    if (task.creatorId !== currentUserId) {
      return res.status(403).json({ error: '이 태스크를 수정할 권한이 없습니다.' });
    }

    // 3. 권한 확인 후, 실제 수정 로직 진행
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
      // 여기서 400 오류를 반환하는 것은 유효합니다 (수정할 내용이 없는 경우).
      return res.status(400).json({ error: '수정할 내용이 없습니다.' });
    }

    params.push(taskId); // WHERE 절에 사용할 taskId 마지막에 추가

    const sql = `UPDATE tasks SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        console.error(`태스크 수정 오류 (ID: ${taskId}):`, err.message); // 타임스탬프 제거
        return res.status(500).json({ error: '태스크 수정 중 오류 발생' });
      }
      // this.changes === 0 경우는 이미 위에서 !task 로 확인했으므로, 이론상으로는 발생하기 어렵습니다.
      // 하지만 방어적으로 남겨둘 수 있습니다.
      if (this.changes === 0) {
         // 이 경우는 사실상 위에서 task 가 없는 경우에 걸러지므로, 로직상 도달하기 어렵습니다.
         // 그래도 혹시 모를 상황에 대비해 남겨두거나, 삭제해도 무방합니다. 여기서는 유지하겠습니다.
        return res.status(404).json({ error: '수정할 태스크를 찾을 수 없습니다.' });
      }

      // 태스크 수정 로그 기록
      logTaskActivity('UPDATE', taskId, currentUserId, req.ip);

      // 수정된 태스크와 작성자 정보를 함께 조회 (기존 로직 유지)
      db.get(
        `SELECT t.*, u.name as creatorName
         FROM tasks t
         LEFT JOIN users u ON t.creatorId = u.employeeId
         WHERE t.id = ?`,
        [taskId],
        (err, updatedTaskData) => { // 변수명 변경 (task -> updatedTaskData)
          if (err) {
            console.error(`수정된 태스크 조회 오류 (ID: ${taskId}):`, err.message); // 타임스탬프 제거
            // 오류가 발생해도 클라이언트에게는 성공적으로 수정되었음을 알리는 것이 좋을 수 있습니다.
            // 아니면 여기서도 500 오류를 반환할 수 있습니다. 우선은 오류 로그만 남기고 진행합니다.
            // 하지만 최신 정보를 반환하는 것이 중요하므로, 500 오류를 반환하는 것이 더 적절할 수 있습니다.
            return res.status(500).json({ error: '수정된 태스크 조회 중 오류 발생' });
          }

          if (!updatedTaskData) {
            // 업데이트는 성공했지만, 어떤 이유로든 조회가 안되는 극히 드문 경우
            console.error(`업데이트 후 태스크 조회 실패 (ID: ${taskId})`); // 타임스탬프 제거
            return res.status(404).json({ error: '업데이트 후 태스크를 찾을 수 없습니다.' });
          }

          // tags 파싱, completed 변환
          const finalUpdatedTask = {
            ...updatedTaskData,
            tags: updatedTaskData.tags ? JSON.parse(updatedTaskData.tags) : [],
            completed: updatedTaskData.completed === 1
          };

          res.json(finalUpdatedTask);
        }
      );
    });
  });
});

// DELETE /api/tasks/:id : 태스크 삭제 (인증 필요)
app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const currentUserId = req.user.employeeId; // 현재 로그인한 사용자 ID

  // 1. 먼저 태스크를 조회하여 작성자 ID를 확인합니다.
  db.get("SELECT creatorId FROM tasks WHERE id = ?", [taskId], (err, task) => {
    if (err) {
      console.error(`태스크 조회 오류 (삭제 전 확인, ID: ${taskId}):`, err.message); // 타임스탬프 제거
      return res.status(500).json({ error: '태스크 정보 조회 중 오류 발생' });
    }

    if (!task) {
      // 태스크가 존재하지 않으면 404 오류 반환
      return res.status(404).json({ error: '삭제할 태스크를 찾을 수 없습니다.' });
    }

    // 2. 작성자와 현재 사용자가 다른 경우 권한 없음 응답
    if (task.creatorId !== currentUserId) {
      return res.status(403).json({ error: '이 태스크를 삭제할 권한이 없습니다.' });
    }

    // 3. 권한 확인 후, 실제 삭제 로직 진행
    const sql = "DELETE FROM tasks WHERE id = ?";
    db.run(sql, [taskId], function(err) {
      if (err) {
        console.error(`태스크 삭제 오류 (ID: ${taskId}):`, err.message); // 타임스탬프 제거
        return res.status(500).json({ error: '태스크 삭제 중 오류 발생' });
      }
      // 여기서 this.changes === 0 인 경우는 위에서 !task 로 이미 확인했으므로,
      // 이론상으로는 발생하기 어렵습니다. 하지만 방어적으로 남겨둘 수 있습니다.
      if (this.changes === 0) {
        // 이 시점에 도달했다면, 조회와 삭제 사이에 무언가 문제가 발생했을 수 있습니다.
        console.warn(`삭제 시도 중 태스크를 찾지 못함 (ID: ${taskId}), 조회 후 삭제 사이에 변경 발생 가능성`); // 타임스탬프 제거
        return res.status(404).json({ error: '삭제할 태스크를 찾을 수 없습니다.' });
      }
      // console.log(`태스크 삭제됨: ${taskId} (삭제 요청자: ${currentUserId})`); // 주석 처리

      // 태스크 삭제 로그 기록
      logTaskActivity('DELETE', taskId, currentUserId, req.ip);

      res.status(200).json({ message: '태스크가 성공적으로 삭제되었습니다.', id: taskId });
    });
  });
});

// JWT 토큰 생성 후 쿠키에 저장할 때 secure 옵션을 동적으로 설정
function isRequestSecure(req) {
  // X-Forwarded-Proto 헤더가 있으면(프록시 환경) 그 값을 사용
  if (req.headers['x-forwarded-proto']) {
    return req.headers['x-forwarded-proto'] === 'https';
  }
  // req.protocol은 express에서 제공 (http/https)
  if (req.protocol) {
    return req.protocol === 'https';
  }
  // 기본적으로 false
  return false;
}

// 활성 토큰 관리를 위한 객체 선언
const activeTokens = {
  // { employeeId: { token: string, timestamp: Date } }
  users: {},

  // 사용자의 활성 토큰 설정
  setUserToken(employeeId, token) {
    this.users[employeeId] = {
      token,
      timestamp: new Date()
    };
    console.log(`사용자 ${employeeId}의 새 토큰이 등록되었습니다.`);
  },

  // 사용자 토큰 확인
  getUserToken(employeeId) {
    return this.users[employeeId] || null;
  },

  // 토큰이 유효한지 확인 (활성 토큰과 일치하는지)
  isTokenValid(employeeId, token) {
    const userToken = this.users[employeeId];
    if (!userToken) return false; // 활성 토큰이 없음
    return userToken.token === token; // 토큰 일치 여부 확인
  },

  // 사용자 토큰 삭제 (로그아웃 시)
  removeUserToken(employeeId) {
    if (this.users[employeeId]) {
      delete this.users[employeeId];
      console.log(`사용자 ${employeeId}의 토큰이 제거되었습니다.`);
      return true;
    }
    return false;
  }
};

// POST /api/login : 로그인 처리
// 로그인 실패 횟수 추적을 위한 객체 선언
const loginFailureTracker = {
  failures: {}, // { employeeId: { count: Number, lastFailTime: Date } }
  maxFailures: 10, // 최대 실패 허용 횟수
  lockDuration: 5 * 60 * 1000, // 5분 (밀리초 단위)

  // 로그인 실패 기록
  recordFailure(employeeId) {
    const now = new Date();
    if (!this.failures[employeeId]) {
      this.failures[employeeId] = { count: 1, lastFailTime: now };
    } else {
      this.failures[employeeId].count += 1;
      this.failures[employeeId].lastFailTime = now;
    }
    console.log(`사용자 ${employeeId}의 로그인 실패 ${this.failures[employeeId].count}회 기록됨`);
  },

  // 로그인 성공 시 실패 기록 초기화
  resetFailures(employeeId) {
    if (this.failures[employeeId]) {
      delete this.failures[employeeId];
      console.log(`사용자 ${employeeId}의 로그인 실패 기록 초기화됨`);
    }
  },

  // 계정이 잠금 상태인지 확인
  isLocked(employeeId) {
    const failure = this.failures[employeeId];
    if (!failure) return false;

    // 실패 횟수가 최대 허용 횟수 이상인 경우
    if (failure.count >= this.maxFailures) {
      const now = new Date();
      const timeSinceLastFailure = now - failure.lastFailTime;

      // 마지막 실패 이후 잠금 시간이 지났는지 확인
      if (timeSinceLastFailure < this.lockDuration) {
        // 아직 잠금 시간 내
        const remainingLockTime = Math.ceil((this.lockDuration - timeSinceLastFailure) / 1000 / 60);
        return { locked: true, remainingMinutes: remainingLockTime };
      } else {
        // 잠금 시간 종료, 실패 카운트 초기화
        this.resetFailures(employeeId);
        return { locked: false };
      }
    }

    return { locked: false };
  }
};

app.post('/api/login', (req, res) => {
  const { employeeId, password } = req.body; // password 추가

  if (!employeeId || !password) { // 사번과 비밀번호 모두 확인
    return res.status(400).json({ error: '사번과 비밀번호를 모두 입력해주세요.' });
  }

  // 로그인 잠금 상태 확인
  const lockStatus = loginFailureTracker.isLocked(employeeId);
  if (lockStatus.locked) {
    // 로그인 잠금 상태인 경우
    console.log(`사용자 ${employeeId}의 로그인 요청 거부 (잠금 상태)`);
    return res.status(429).json({
      error: `로그인 실패 횟수 초과. ${lockStatus.remainingMinutes}분 후에 다시 시도해주세요.`
    });
  }

  // mustChangePassword 필드도 함께 조회
  const sql = "SELECT employeeId, name, passwordHash, mustChangePassword FROM users WHERE employeeId = ?";
  db.get(sql, [employeeId], (err, user) => {
    if (err) {
      console.error(`로그인 처리 중 DB 오류:`, err.message);
      return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    }

    if (user && user.passwordHash) {
      // 사용자가 존재하고 비밀번호 해시가 있는 경우, 비밀번호 비교
      bcrypt.compare(password, user.passwordHash, (compareErr, isMatch) => {
        if (compareErr) {
          console.error(`비밀번호 비교 중 오류:`, compareErr);
          return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
        }

        if (isMatch) {
          // 비밀번호 일치 - 실패 카운트 초기화
          loginFailureTracker.resetFailures(employeeId);

          if (user.mustChangePassword === 1) {
            // 비밀번호 변경 필요
            console.log(`로그인 성공 (임시 비밀번호): ${user.employeeId}. 비밀번호 변경 필요.`);
            // 로그인 로그 기록 (임시 비밀번호)
            logTaskActivity('LOGIN_TEMP_PASSWORD', null, user.employeeId, req.ip);
            // 토큰 없이 비밀번호 변경 필요 응답 전송
            res.status(200).json({
              message: '비밀번호 변경이 필요합니다.',
              mustChangePassword: true,
              user: { employeeId: user.employeeId, name: user.name }
            });
          } else {
            // 비밀번호 변경 불필요 (정상 로그인)
            console.log(`로그인 성공: ${user.employeeId} (${user.name || '이름 없음'})`);
            // 로그인 로그 기록 (정상)
            logTaskActivity('LOGIN_SUCCESS', null, user.employeeId, req.ip);

            // JWT 토큰 생성
            const token = jwt.sign(
              { employeeId: user.employeeId, name: user.name },
              JWT_SECRET,
              { expiresIn: JWT_EXPIRES_IN }
            );

            // 기존 세션이 있는지 확인
            const existingToken = activeTokens.getUserToken(user.employeeId);
            let sessionMessage = '';

            if (existingToken) {
              // 기존 세션이 있으면 메시지 생성
              sessionMessage = '다른 곳에서 로그인한 기존 세션은 종료됩니다.';
              // 로그 기록
              logTaskActivity('SESSION_REPLACED', null, user.employeeId, req.ip);
            }

            // 새 토큰을 활성 토큰으로 설정
            activeTokens.setUserToken(user.employeeId, token);

            // secure 옵션 동적 결정
            const secureCookie = isRequestSecure(req);

            // 쿠키에 JWT 토큰 저장
            res.cookie('token', token, {
              httpOnly: true,
              secure: secureCookie, // HTTPS 요청에서만 secure
              maxAge: 24 * 60 * 60 * 1000,
              sameSite: 'lax',
              path: '/'
            });

            // 정상 성공 응답 (쿠키에 토큰 포함)
            res.status(200).json({
              message: '로그인 성공' + (sessionMessage ? '. ' + sessionMessage : ''),
              mustChangePassword: false, // 명시적으로 추가
              user: { employeeId: user.employeeId, name: user.name },
              token: token, // 토큰을 응답 본문에도 포함
              sessionReplaced: !!existingToken // 세션 교체 여부
            });
          }
        } else {
          // 비밀번호 불일치 - 실패 카운트 증가
          loginFailureTracker.recordFailure(employeeId);

          // 실패 후 잠금 상태 확인
          const lockStatus = loginFailureTracker.isLocked(employeeId);
          if (lockStatus.locked) {
            // 이번 실패로 잠금 상태가 되었다면
            return res.status(429).json({
              error: `로그인 실패 횟수 초과. ${lockStatus.remainingMinutes}분 후에 다시 시도해주세요.`
            });
          } else {
            // 아직 잠금 상태가 아니라면 남은 시도 횟수 알림
            const remainingAttempts = loginFailureTracker.maxFailures - (loginFailureTracker.failures[employeeId]?.count || 0);
            res.status(401).json({
              error: `사번 또는 비밀번호가 잘못되었습니다. 남은 시도 횟수: ${remainingAttempts}회`
            });
          }
        }
      });
    } else {
      // 사용자가 존재하지 않는 경우도 실패 카운트 증가 (employeeId가 유효하면)
      if (employeeId) {
        loginFailureTracker.recordFailure(employeeId);
      }

      // 보안을 위해 사용자가 존재하지 않는다는 정보 노출 방지
      res.status(401).json({ error: '사번 또는 비밀번호가 잘못되었습니다.' });
    }
  });
});

// POST /api/change-password : 비밀번호 변경 처리
app.post('/api/change-password', (req, res) => {
  const { employeeId, currentPassword, newPassword } = req.body;

  // 입력 값 검증
  if (!employeeId || !currentPassword || !newPassword) {
    return res.status(400).json({ error: '사번, 현재 비밀번호, 새 비밀번호를 모두 입력해주세요.' });
  }

  if (newPassword.length < 6) { // 간단한 비밀번호 길이 검증 예시
    return res.status(400).json({ error: '새 비밀번호는 6자 이상이어야 합니다.' });
  }

  // 사용자 정보 조회 (passwordHash, mustChangePassword 포함)
  const sqlSelect = "SELECT name, passwordHash, mustChangePassword FROM users WHERE employeeId = ?"; // name도 함께 조회
  db.get(sqlSelect, [employeeId], (err, user) => {
    if (err) {
      console.error(`비밀번호 변경 중 DB 오류 (사용자 조회):`, err.message);
      return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' });
    }

    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    // 임시 비밀번호가 아닌 경우 (첫 변경이 아닌 경우) currentPassword 확인
    if (user.mustChangePassword !== 1) {
        bcrypt.compare(currentPassword, user.passwordHash, (compareErr, isMatch) => {
            if (compareErr) {
                console.error(`비밀번호 변경 중 오류 (비밀번호 비교):`, compareErr);
                return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' });
            }
            if (!isMatch) {
                return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
            }
            // 현재 비밀번호 일치 시 새 비밀번호 해싱 및 업데이트 진행
            hashAndUpdatePassword(req, res, employeeId, newPassword, user.name); // user.name 전달
        });
    } else {
        // 임시 비밀번호인 경우 currentPassword(임시 비밀번호) 확인
         bcrypt.compare(currentPassword, user.passwordHash, (compareErr, isMatch) => {
             if (compareErr) {
                 console.error(`비밀번호 변경 중 오류 (임시 비밀번호 비교):`, compareErr);
                 return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' });
             }
             if (!isMatch) {
                 // 현재 비밀번호(임시) 불일치
                 return res.status(401).json({ error: '현재 비밀번호(임시)가 일치하지 않습니다.' });
             }
             // 임시 비밀번호 일치 시 새 비밀번호 해싱 및 업데이트 진행
             hashAndUpdatePassword(req, res, employeeId, newPassword, user.name); // user.name 전달
         });
    }
  });
});

// 비밀번호 해싱 및 업데이트 로직 분리 (재사용성 및 가독성)
function hashAndUpdatePassword(req, res, employeeId, newPassword, userName) {
  try {
    const saltRounds = 10;
    const newPasswordHash = bcrypt.hashSync(newPassword, saltRounds);

    const sqlUpdate = "UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE employeeId = ?";
    db.run(sqlUpdate, [newPasswordHash, employeeId], function(updateErr) {
      if (updateErr) {
        console.error(`비밀번호 변경 중 DB 오류 (업데이트):`, updateErr.message);
        return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' });
      }

      if (this.changes === 0) {
        console.error(`비밀번호 업데이트 실패 (변경된 행 없음): employeeId ${employeeId}`);
        return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' });
      }

      console.log(`사용자 ${employeeId}의 비밀번호가 성공적으로 변경되었습니다.`);

      // 토큰 생성 및 쿠키 설정
      const token = jwt.sign(
        { employeeId: employeeId, name: userName },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // secure 옵션 동적 결정
      const secureCookie = isRequestSecure(req);

      res.cookie('token', token, {
        httpOnly: true,
        secure: secureCookie, // HTTPS 요청에서만 secure
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/'
      });

      res.status(200).json({
        message: '비밀번호가 성공적으로 변경되었습니다.',
        user: { employeeId: employeeId, name: userName },
        token: token
      });
    });
  } catch (hashError) {
    console.error(`비밀번호 변경 중 오류 (해싱):`, hashError);
    return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다.' });
  }
}

// --- API 엔드포인트 정의 끝 ---

// --- 인증 미들웨어를 사용하여 /index.html 경로 보호 ---
app.get('/index.html', authenticatePage, (req, res) => {
  // 캐시 제어 헤더 추가
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 404 Handler ---
// This should be placed after all other routes but before the global error handler
app.use((req, res, next) => {
  // For API requests, send a JSON 404 response
  if (req.accepts('json') && !req.accepts('html')) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  // For browser requests, send a simple HTML 404 page
  res.status(404).send('<html><head><title>Error 404: Not Found</title></head><body><h1>404: Page Not Found</h1><p>The page you are looking for does not exist.</p></body></html>');
});

// --- Global Error Handler ---
// This should be the last middleware
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    console.warn('Invalid CSRF token received for path:', req.path, 'from IP:', req.ip);
    // For API requests, send a JSON 403 response
    if (req.path.startsWith("/api/") || (req.accepts('json') && !req.accepts('html'))) {
      res.status(403).json({ error: 'Invalid CSRF token. Please refresh and try again.' });
    } else {
      // For browser requests, maybe a more user-friendly HTML page
      res.status(403).send("<html><head><title>Invalid Request</title></head><body><h1>403 Forbidden - Invalid CSRF Token</h1><p>Your request could not be processed. Please refresh the page and try again. If the problem persists, please contact support.</p></body></html>");
    }
    return;
  }
  console.error(`[GLOBAL ERROR HANDLER] Timestamp: ${new Date().toISOString()}, Path: ${req.path}, Error: `, err); // Log the full error server-side

  // Check if headers have already been sent
  if (res.headersSent) {
    return next(err); // Delegate to default Express error handler if headers already sent
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500; // Use error's status or default to 500

  // For API requests, send a JSON error response
  // Prioritize JSON for API-like requests (e.g., starts with /api/ or accepts json primarily)
  if (req.path.startsWith('/api/') || (req.accepts('json') && !req.accepts('html'))) {
    if (isProduction) {
      res.status(statusCode).json({ error: 'An unexpected error occurred. Please try again later.' });
    } else {
      res.status(statusCode).json({ error: err.message, stack: err.stack }); // Detailed error in dev
    }
    return;
  }

  // For browser requests, send a simple HTML error page
  if (isProduction) {
    res.status(statusCode).send(`<html><head><title>Error</title></head><body><h1>Server Error</h1><p>An unexpected error occurred. Please try again later.</p></body></html>`);
  } else {
    // In development, you might want to use Express's default error handler for HTML pages
    // or send a more detailed HTML error page. For now, let's send stack for non-prod HTML.
    res.status(statusCode).send(`<html><head><title>Error</title></head><body><h1>Error ${statusCode}</h1><pre>${err.stack}</pre></body></html>`);
  }
});


// 6. 서버 시작
// HTTP 서버 시작 (개발용 또는 리디렉션용)
app.listen(port, '0.0.0.0', () => {
  console.log(`HTTP 서버가 0.0.0.0:${port} 에서 실행 중입니다.`);
});

// HTTPS 서버 시작 (SSL 인증서가 있는 경우에만)
if (sslOptions && sslOptions.key && sslOptions.cert) {
  try {
    const httpsServer = https.createServer(sslOptions, app);
    httpsServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.error(`오류: 포트 ${httpsPort}가 이미 사용 중입니다. 다른 포트를 사용하세요.`);
      } else {
        console.error('HTTPS 서버 시작 오류:', e);
      }
    });

    httpsServer.listen(httpsPort, '0.0.0.0', () => {
      console.log(`HTTPS 서버가 0.0.0.0:${httpsPort} 에서 실행 중입니다.`);
      console.log('HTTPS 활성화됨: HTTPS로 안전하게 접속할 수 있습니다.');
    });
  } catch (error) {
    console.error('HTTPS 서버 시작 실패:', error);
  }
} else {
  console.log('SSL 인증서 없음: HTTPS 서버를 시작할 수 없습니다. HTTP만 사용 가능합니다.');
}

// 서버 종료 시 데이터베이스 연결 닫기 (Graceful Shutdown)
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    // console.log('데이터베이스 연결이 닫혔습니다.'); // 주석 처리
    process.exit(0);
  });
});

// 로그 기록 함수 정의
function logTaskActivity(action, taskId, userId, ip = 'unknown') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 +1, 두 자리로 패딩
  const day = String(now.getDate()).padStart(2, '0'); // 날짜를 두 자리로 패딩

  const dateFolder = `${year}-${month}-${day}`;
  const logDir = path.join(__dirname, 'logs', dateFolder);

  // 로그 디렉토리 생성 (존재하지 않으면)
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true }); // recursive: true 옵션으로 중간 경로도 생성
    } catch (mkdirErr) {
      console.error('로그 디렉토리 생성 오류:', mkdirErr);
      // 디렉토리 생성 실패 시 더 이상 진행하지 않음
      return;
    }
  }

  const timestamp = now.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const logMessage = `[${timestamp}] ${action}: Task ID: ${taskId}, User ID: ${userId}, IP: ${ip}\n`;
  const logFile = path.join(logDir, 'task_activity_log.txt'); // 수정된 파일 경로

  fs.appendFile(logFile, logMessage, (err) => {
    if (err) {
      console.error('로그 파일 작성 오류:', err);
    }
  });
}
