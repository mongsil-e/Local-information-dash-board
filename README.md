# Task Management Dashboard

This project is a task management dashboard application.

## System Architecture

The application is structured as a modern web application with a separate frontend and backend.

### 1. Frontend

*   **Framework:** React (bootstrapped with Vite)
*   **Location:** `frontend/` directory
*   **Key Features & Libraries:**
    *   **UI Components:** Built with React functional components and hooks.
    *   **Routing:** Client-side routing managed by `react-router-dom`.
    *   **State Management:**
        *   `AuthContext`: Manages user authentication state (user details, JWT token status).
        *   `DataContext`: Manages dashboard data (tasks, columns), including fetching from the backend and providing CRUD helper functions for optimistic updates.
    *   **Drag and Drop:** Task movement between columns implemented using `@hello-pangea/dnd` (a fork of `react-beautiful-dnd` compatible with React 18+).
    *   **Styling:** Primarily through global CSS (`frontend/src/index.css`) and component-specific CSS files (e.g., `Header.css`, `TaskModal.css`).
*   **Build:** The Vite development server (`npm run dev` in `frontend/`) provides hot module replacement and proxies API requests to the backend. For production, `npm run build` in `frontend/` creates optimized static assets in `frontend/dist/`.

### 2. Backend

*   **Framework:** Node.js with Express.js
*   **Main File:** `server.js` (at the project root)
*   **Responsibilities:**
    *   Serves the built React frontend application (static files from `frontend/dist/`).
    *   Provides a RESTful API for data operations (tasks, columns).
    *   Handles user authentication (login, logout, password changes) using JWTs (JSON Web Tokens). Tokens are stored in HTTP-only cookies.
    *   Manages user sessions and provides CSRF protection for secure operations.
    *   Interacts with the SQLite database for data persistence.
    *   Includes HTTPS support with self-signed certificate generation (for development/testing).
    *   Performs activity logging.
*   **API Endpoints:** All API routes are prefixed with `/api`. Key examples include:
    *   `/api/login`, `/api/logout`, `/api/change-password`
    *   `/api/auth-status`, `/api/csrf-token`
    *   `/api/data` (fetches all tasks and columns)
    *   `/api/tasks` (CRUD operations for tasks)

### 3. Database

*   **Type:** SQLite
*   **File:** `database.db` (at the project root)
*   **Schema:** Includes tables for `users`, `columns`, and `tasks`. Relationships are managed via foreign keys (e.g., `tasks.columnId`, `tasks.creatorId`).

### 4. AI Assistant (Note)

*   The original application had code for integrating with a local AI service (Jan.ai on `http://127.0.0.1:1337`).
*   While some UI placeholders for this might exist in the React codebase, the full functionality and its current status would need further review if it's a requirement. The backend (`server.js`) does not directly interact with this AI service; it's a client-side integration.

## Getting Started

Follow these instructions to set up and run the application on your local machine.

### Prerequisites

*   **Node.js:** Ensure you have Node.js installed (which includes npm). You can download it from [nodejs.org](https://nodejs.org/). Version 18.x or later is recommended.
*   **npm or yarn:** A package manager for Node.js. npm is included with Node.js.

### Backend Setup

1.  **Clone the Repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Configure Environment Variables:**
    *   The backend requires a `JWT_SECRET` for signing authentication tokens.
    *   Create a `.env` file in the project root (where `server.js` is located).
    *   Add the following line to the `.env` file, replacing `your_strong_jwt_secret_here` with a strong, random string:
        ```env
        JWT_SECRET=your_strong_jwt_secret_here
        NODE_ENV=development # Or 'production'
        ```
    *   `NODE_ENV` can be set to `development` for local development or `production` for deployment. This affects things like error detail levels and HTTPS redirection.

3.  **Install Backend Dependencies:**
    *   Navigate to the project root directory (if not already there).
    *   Run:
        ```bash
        npm install
        ```

4.  **Run the Backend Server:**
    *   From the project root directory:
        ```bash
        node server.js
        ```
    *   The backend server will typically start on HTTP port 3000 and HTTPS port 8443 (if SSL certificates are generated/found in an `ssl/` directory). Check the console output for the exact ports.
    *   The first time you run the server, it might generate self-signed SSL certificates in an `ssl/` directory if they don't exist.

### Frontend Setup

1.  **Navigate to the Frontend Directory:**
    *   From the project root:
        ```bash
        cd frontend
        ```

2.  **Install Frontend Dependencies:**
    *   Run:
        ```bash
        npm install
        ```

3.  **Run the Frontend Development Server:**
    *   From the `frontend/` directory:
        ```bash
        npm run dev
        ```
    *   This will start the Vite development server, typically on port 5173 (check your console output).
    *   The development server is configured to proxy API requests starting with `/api` to the backend server (assumed to be running on `http://localhost:3000`).

### Accessing the Application

*   Once both backend and frontend servers are running, open your web browser and navigate to the address provided by the Vite development server (e.g., `http://localhost:5173`).
*   You should see the login page. After logging in, you'll be redirected to the main dashboard.

### Building for Production (Frontend)

1.  **Navigate to the Frontend Directory:**
    ```bash
    cd frontend
    ```
2.  **Build the Application:**
    ```bash
    npm run build
    ```
    This command compiles the React application into static assets located in the `frontend/dist/` directory.
3.  **Serving the Production Build:**
    *   When the backend server (`server.js`) is run (especially with `NODE_ENV=production`), it is configured to serve the static files from `frontend/dist/`. So, after building the frontend, running `node server.js` from the project root will serve the production-ready version of the entire application.
