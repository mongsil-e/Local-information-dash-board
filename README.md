네, 해당 깃허브 README 파일을 한국어로 번역해 드리겠습니다. 기술 용어는 개발자들이 이해하기 쉽도록 원어를 병기하거나 그대로 사용하는 것이 일반적이므로, 그 관례를 따랐습니다.

---

### **작업 관리 대시보드 (Task Management Dashboard)**

이 프로젝트는 작업 관리 대시보드 애플리케이션입니다.

### **시스템 아키텍처**

이 애플리케이션은 프론트엔드와 백엔드가 분리된 현대적인 웹 애플리케이션 구조를 가집니다.

#### **1. 프론트엔드 (Frontend)**

*   **프레임워크**: React (Vite를 사용하여 구성됨)
*   **위치**: `frontend/` 디렉토리
*   **주요 기능 및 라이브러리**:
    *   **UI 컴포넌트**: React 함수형 컴포넌트와 훅(hook)을 사용하여 구축되었습니다.
    *   **라우팅**: `react-router-dom`을 통해 클라이언트 사이드 라우팅을 관리합니다.
    *   **상태 관리**:
        *   **AuthContext**: 사용자 인증 상태(사용자 정보, JWT 토큰 상태)를 관리합니다.
        *   **DataContext**: 대시보드 데이터(작업, 컬럼)를 관리하며, 백엔드로부터 데이터를 가져오고 낙관적 업데이트(optimistic updates)를 위한 CRUD 헬퍼 함수를 제공합니다.
    *   **드래그 앤 드롭**: `@hello-pangea/dnd`(React 18+와 호환되는 `react-beautiful-dnd`의 포크 버전)를 사용하여 컬럼 간 작업 이동을 구현했습니다.
    *   **스타일링**: 주로 전역 CSS(`frontend/src/index.css`)와 컴포넌트별 CSS 파일(예: `Header.css`, `TaskModal.css`)을 통해 이루어집니다.
    *   **빌드**: Vite 개발 서버(`frontend/`에서 `npm run dev` 실행)는 HMR(Hot Module Replacement) 기능을 제공하고 API 요청을 백엔드로 프록시(proxy)합니다. 프로덕션용으로는 `frontend/`에서 `npm run build`를 실행하여 `frontend/dist/`에 최적화된 정적 에셋(static assets)을 생성합니다.

#### **2. 백엔드 (Backend)**

*   **프레임워크**: Node.js와 Express.js
*   **메인 파일**: `server.js` (프로젝트 루트 위치)
*   **주요 기능**:
    *   빌드된 React 프론트엔드 애플리케이션을 제공합니다 (`frontend/dist/`의 정적 파일).
    *   데이터 작업(작업, 컬럼)을 위한 RESTful API를 제공합니다.
    *   JWT(JSON Web Tokens)를 사용하여 사용자 인증(로그인, 로그아웃, 비밀번호 변경)을 처리합니다. 토큰은 HTTP-only 쿠키에 저장됩니다.
    *   사용자 세션을 관리하고 안전한 작업을 위해 CSRF 보호 기능을 제공합니다.
    *   데이터 영속성(persistence)을 위해 SQLite 데이터베이스와 상호작용합니다.
    *   자체 서명 인증서 생성을 통한 HTTPS를 지원합니다 (개발/테스트용).
    *   활동 로그를 기록합니다.
*   **API 엔드포인트**: 모든 API 경로는 `/api` 접두사로 시작됩니다. 주요 예시는 다음과 같습니다:
    *   `/api/login`, `/api/logout`, `/api/change-password`
    *   `/api/auth-status`, `/api/csrf-token`
    *   `/api/data` (모든 작업과 컬럼을 가져옴)
    *   `/api/tasks` (작업에 대한 CRUD 작업)

#### **3. 데이터베이스 (Database)**

*   **유형**: SQLite
*   **파일**: `database.db` (프로젝트 루트 위치)
*   **스키마**: `users`, `columns`, `tasks` 테이블을 포함합니다. 관계는 외래 키(foreign key)(예: `tasks.columnId`, `tasks.creatorId`)를 통해 관리됩니다.

#### **4. AI 어시스턴트 (참고)**

*   원본 애플리케이션에는 로컬 AI 서비스(http://127.0.0.1:1337의 Jan.ai)와 통합하기 위한 코드가 있었습니다.
*   React 코드베이스에 이를 위한 일부 UI 플레이스홀더가 존재할 수 있지만, 전체 기능과 현재 상태는 요구사항일 경우 추가적인 검토가 필요합니다. 백엔드(`server.js`)는 이 AI 서비스와 직접 상호작용하지 않으며, 이는 클라이언트 사이드 통합입니다.

### **시작하기**

로컬 머신에서 애플리케이션을 설정하고 실행하려면 다음 지침을 따르세요.

#### **사전 요구사항**

*   **Node.js**: Node.js가 설치되어 있는지 확인하세요 (npm 포함). [nodejs.org](https://nodejs.org)에서 다운로드할 수 있습니다. 버전 18.x 이상을 권장합니다.
*   **npm 또는 yarn**: Node.js용 패키지 매니저. npm은 Node.js에 포함되어 있습니다.

#### **백엔드 설정**

1.  **리포지토리 복제(Clone):**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **환경 변수 설정:**
    *   백엔드는 인증 토큰 서명을 위해 `JWT_SECRET`이 필요합니다.
    *   프로젝트 루트(`server.js`가 있는 위치)에 `.env` 파일을 생성하세요.
    *   다음 줄을 `.env` 파일에 추가하고, `your_strong_jwt_secret_here`를 강력하고 무작위적인 문자열로 교체하세요:
      ```
      JWT_SECRET=your_strong_jwt_secret_here
      NODE_ENV=development # 또는 'production'
      ```
    *   `NODE_ENV`는 로컬 개발 시 `development`로, 배포 시 `production`으로 설정할 수 있습니다. 이는 오류 상세 정보 수준이나 HTTPS 리디렉션 등에 영향을 줍니다.

3.  **백엔드 의존성 설치:**
    *   프로젝트 루트 디렉토리로 이동합니다 (이미 있는 경우 생략).
    *   다음 명령어를 실행하세요:
      ```bash
      npm install
      ```

4.  **백엔드 서버 실행:**
    *   프로젝트 루트 디렉토리에서 다음을 실행하세요:
      ```bash
      node server.js
      ```
    *   백엔드 서버는 일반적으로 HTTP 포트 3000과 HTTPS 포트 8443에서 시작됩니다 (`ssl/` 디렉토리에 SSL 인증서가 생성/발견될 경우). 정확한 포트는 콘솔 출력을 확인하세요.
    *   서버를 처음 실행할 때, `ssl/` 디렉토리가 없으면 자체 서명된 SSL 인증서가 생성될 수 있습니다.

#### **프론트엔드 설정**

1.  **프론트엔드 디렉토리로 이동:**
    *   프로젝트 루트에서 다음을 실행하세요:
      ```bash
      cd frontend
      ```

2.  **프론트엔드 의존성 설치:**
    *   다음 명령어를 실행하세요:
      ```bash
      npm install
      ```

3.  **프론트엔드 개발 서버 실행:**
    *   `frontend/` 디렉토리에서 다음을 실행하세요:
      ```bash
      npm run dev
      ```
    *   이 명령어는 Vite 개발 서버를 시작하며, 일반적으로 포트 5173에서 실행됩니다 (콘솔 출력을 확인하세요).
    *   개발 서버는 `/api`로 시작하는 API 요청을 백엔드 서버(http://localhost:3000에서 실행 중이라고 가정)로 프록시하도록 설정되어 있습니다.

#### **애플리케이션 접속하기**

백엔드와 프론트엔드 서버가 모두 실행되면, 웹 브라우저를 열고 Vite 개발 서버가 제공하는 주소(예: `http://localhost:5173`)로 이동하세요.
로그인 페이지가 나타날 것입니다. 로그인하면 메인 대시보드로 리디렉션됩니다.

### **프로덕션용 빌드 (프론트엔드)**

1.  **프론트엔드 디렉토리로 이동:**
    ```bash
    cd frontend
    ```
2.  **애플리케이션 빌드:**
    ```bash
    npm run build
    ```
    이 명령어는 React 애플리케이션을 컴파일하여 `frontend/dist/` 디렉토리에 정적 에셋(static assets)으로 생성합니다.

3.  **프로덕션 빌드 실행하기:**
    백엔드 서버(`server.js`)가 실행될 때 (특히 `NODE_ENV=production` 환경에서), `frontend/dist/`의 정적 파일을 제공하도록 설정되어 있습니다. 따라서 프론트엔드를 빌드한 후, 프로젝트 루트에서 `node server.js`를 실행하면 전체 애플리케이션의 프로덕션 준비 버전을 제공하게 됩니다.
