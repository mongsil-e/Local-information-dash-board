        // --- Constants ---
        const LOCAL_STORAGE_DATA_KEY = 'taskAppData_v2'; // Versioning for potential structure changes
        const LOCAL_STORAGE_SETTINGS_KEY = 'taskAppSettings_v2';
        const JAN_API_BASE_URL = "http://127.0.0.1:1337/v1";
        const JAN_API_CHAT_ENDPOINT = "/chat/completions";
        const JAN_API_MODELS_ENDPOINT = "/models";
        const DEBOUNCE_DELAY = 300; // ms for search input debounce
        const PGM_COLUMN_IDS = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink']; // PGM Sub-column IDs

        // --- Utility Functions ---
        const utils = {
            generateId: () => `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            debounce: (func, wait) => {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func.apply(this, args); // Use apply to maintain context
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            },
            formatDueDateForDisplay: (dueDateString) => {
                if (!dueDateString) return '날짜 없음';
                try {
                    const date = new Date(dueDateString);
                    date.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today);
                    tomorrow.setDate(today.getDate() + 1);

                    const timeDiff = date.getTime() - today.getTime();
                    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)); // Use Math.ceil
                    // More robust date formatting
                    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
                } catch (e) {
                    console.error("Error formatting date:", dueDateString, e);
                    return '날짜 형식 오류';
                }
            },
            getDueDateClass: (dueDateString) => {
                if (!dueDateString) return '';
                try {
                    const date = new Date(dueDateString);
                    date.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const timeDiff = date.getTime() - today.getTime();
                    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)); // Use Math.ceil

                    if (dayDiff < 0) return 'task__due-date--overdue';
                    if (dayDiff === 0) return 'task__due-date--today';
                    if (dayDiff === 1) return 'task__due-date--tomorrow';
                    return '';
                } catch (e) {
                    return '';
                }
            },
            // Simple alert for feedback (replace with a Toast library later if needed)
            showFeedback: (message, type = 'info') => {
                // console[type](message); // Log to console as well
                alert(`[${type.toUpperCase()}] ${message}`);
            },
            escapeHtml: (unsafe) => {
                 return unsafe
                     .replace(/&/g, "&amp;")
                     .replace(/</g, "&lt;")
                     .replace(/>/g, "&gt;")
                     .replace(/"/g, "&quot;")
                     .replace(/'/g, "&#039;");
            }
        };

        const app = (function(utils) {
            // --- State ---
            let appData = {
                tasks: [],
                columns: [
                    { id: 'noticeboard', title: '공지 보드', order: 0 },
                    { id: 'gotowork', title: '지시 사항', order: 1 },
                    { id: 'information', title: '특이 사항', order: 2 },
                    { id: 'taskboard', title: '업무 보드', order: 3 },
                    { id: 'todowork', title: '할일', order: 4 },
                    { id: 'inprogress', title: '진행중', order: 5 },
                    { id: 'welldone', title: '완료', order: 6 }
                ],
                settings: {
                    darkMode: false,
                    showQuickAdd: true
                },
                janAI: {
                    connected: false,
                    model: null,
                    availableModels: []
                }
            };

            let draggedTask = null;
            let dragPlaceholder = null;
            let currentMenu = null;
            let currentTags = [];

            // --- DOM Elements ---
            const board = document.getElementById('board');
            const taskModal = document.getElementById('taskModal');
            const taskForm = document.getElementById('taskForm');
            const modalTitle = document.getElementById('modalTitle');
            const searchInput = document.getElementById('searchInput');
            const detailModal = document.getElementById('taskDetailModal');
            const detailContent = document.getElementById('taskDetailContent');
            const tagInput = document.getElementById('tagInput');
            const tagsContainer = document.getElementById('tagsContainer');
            const themeToggle = document.querySelector('.header__theme-toggle');
            const aiModelSelector = document.getElementById('aiModelSelector');
            const toggleAI = document.getElementById('toggleAI');
            const aiOrganize = document.getElementById('aiOrganize');
            const aiInterface = document.getElementById('aiInterface');
            const aiPrompt = document.getElementById('aiPrompt');
            const executeAI = document.getElementById('executeAI');
            const closeAI = document.getElementById('closeAI');
            const aiResponse = document.getElementById('aiResponse');
            const aiSuggestions = document.querySelector('.ai-suggestions');

            // --- 탭 관리자 객체 ---
            // DOM 요소들이 정의된 *후*, 이를 사용하는 함수들(init 등)이 정의되기 *전*에 위치해야 함
            const tabManager = {
                tabs: document.querySelectorAll('.tabs__tab'),
                contents: document.querySelectorAll('.tab-content'),
                boardElement: document.getElementById('board'), // 대시보드 요소
                aiControlsElement: document.querySelector('.ai-controls'), // AI 컨트롤 요소 추가

                activateTab: function(activeIndex) {
                    // 필수 DOM 요소 확인 강화 맨앞에 !this.tabs || 추가
                    if (!this.tabs || !this.contents || !this.boardElement || !this.aiControlsElement) {
                        console.error("TabManager: 필수 DOM 요소가 없습니다 (tabs, contents, board, aiControls).");
                        return;
                    }

                    let activeContent = null; // 활성 콘텐츠 요소 저장 변수

                    this.tabs.forEach((tab, index) => {
                        const content = this.contents[index];
                        if (index === activeIndex) {
                            tab.classList.add('tabs__tab--active');
                            if (content) {
                                content.classList.add('tab-content--active');
                                activeContent = content; // 활성 콘텐츠 저장

                                // PGM 히스토리 탭 특정 로직
                                if (content.id === 'pgm-history-content') {
                                    if (typeof app !== 'undefined' && typeof app.renderPgmHistory === 'function') {
                                        app.renderPgmHistory();
                                    }
                                    this.boardElement.style.display = 'none';
                                } else if (content.id === 'dashboard-content') {
                                    // 대시보드 탭 특정 로직
                                    this.boardElement.style.display = 'grid'; // 메인 보드 표시
                                } else {
                                    // 다른 탭들
                                    this.boardElement.style.display = 'none';
                                }
                            }
                        } else {
                            tab.classList.remove('tabs__tab--active');
                            if (content) content.classList.remove('tab-content--active');
                        }
                    });

                    // 기본 탭 처리 로직 (대시보드 탭이 기본)
                    const dashboardContent = this.contents[0];
                    const anyTabActive = activeContent !== null;

                    if (!anyTabActive && dashboardContent && dashboardContent.id === 'dashboard-content') {
                        if (this.tabs[0]) this.tabs[0].classList.add('tabs__tab--active');
                        dashboardContent.classList.add('tab-content--active');
                        this.boardElement.style.display = 'grid';
                        activeContent = dashboardContent; // 기본 활성 탭 설정
                    }

                    // AI 관련 버튼 항상 숨김 처리
                    this.aiControlsElement.style.display = 'none'; // 모든 탭에서 AI 컨트롤 숨기기
                    /*  // <--- 주석 시작
                    if (activeContent && activeContent.id === 'pgm-history-content') {
                        // this.aiControlsElement.style.display = 'none'; // PGM 탭에서 AI 컨트롤 숨기기
                    } else {
                        // this.aiControlsElement.style.display = 'flex'; // 다른 탭에서 AI 컨트롤 보이기
                    }
                    */  // <--- 주석 끝
                }
            };

            // --- Jan API Class ---
            class JanAI {
                constructor() {
                    this.baseUrl = JAN_API_BASE_URL;
                    this.chatEndpoint = JAN_API_CHAT_ENDPOINT;
                    this.modelsEndpoint = JAN_API_MODELS_ENDPOINT;
                }

            // JanAI 클래스 내 checkConnection 함수 수정

            async checkConnection() {
                // ... (기존 코드: fetch 요청 전까지)
                try {
                    const response = await fetch(`${this.baseUrl}${this.modelsEndpoint}`); // 필요하다면 여기에 파라미터 추가 (가능성 3 참고)
                    if (!response.ok) throw new Error(`API 연결 실패 (${response.status})`);

                    const data = await response.json();
                    const allModels = data.data || [];

                    // --- 여기가 중요: 로컬/다운로드된 모델만 필터링 ---
                    // 예시: 만약 모델 객체에 'status' 속성이 있고, 준비된 상태가 'downloaded' 인 모델만 리스트업 해서 띄움
                    // 확인 방법 개발자 도구>네트워크>response> 로컬 모델과 아닌모델 비교시 downloaded와 downloadable의 차이점이 있었음
                    const localModels = allModels.filter(model => model.status === 'downloaded');
                    // appData 업데이트 및 모델 선택기 채우기는 필터링된 목록(localModels)으로 수행
                    appData.janAI.connected = true;
                    appData.janAI.availableModels = localModels; // 필터링된 목록 저장

                    if (localModels.length > 0) {
                        appData.janAI.model = localModels[0].id; // 기본 선택도 필터링된 목록에서
                        this.updateModelSelector(localModels);   // 선택기 업데이트도 필터링된 목록으로
                        aiModelSelector.disabled = false;
                        toggleAI.disabled = false;
                        aiOrganize.disabled = false;
                        console.info("Jan.ai 연결 성공 (로컬 모델 필터링됨):", localModels.map(m => m.id).join(', '));
                    } else {
                        // 필터링 후 모델이 하나도 없다면
                        throw new Error("사용 가능한 로컬 AI 모델이 없습니다.");
                    }
                    return { connected: true, models: localModels }; // 반환값도 필터링된 목록으로

                } catch (error) {
                    // ... (기존 에러 처리 코드)
                    console.error("Jan.ai 연결 또는 모델 필터링 오류: /// 현재는 사용불가", error);
                    // ...
                }
            }

                updateModelSelector(models) {
                    aiModelSelector.innerHTML = ''; // Clear existing options
                    if (models.length === 0) {
                        aiModelSelector.innerHTML = '<option value="">사용 가능한 모델 없음</option>';
                        aiModelSelector.disabled = true;
                        return;
                    }

                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.id;
                        option.textContent = model.id.length > 30 ? model.id.substring(0, 27) + '...' : model.id; // Shorten long names
                        option.title = model.id; // Full name on hover
                        aiModelSelector.appendChild(option);
                    });

                    aiModelSelector.value = appData.janAI.model || models[0].id;
                    aiModelSelector.disabled = false;
                }

                async sendPrompt(prompt, systemMessage = null) {
                    if (!appData.janAI.connected || !appData.janAI.model) {
                        throw new Error("Jan에 연결되지 않았거나 모델이 선택되지 않았습니다.");
                    }

                    setAIProcessing(true); // Disable button, show loading

                    const messages = [];
                    if (systemMessage) {
                        messages.push({ role: "system", content: systemMessage });
                    }
                    messages.push({ role: "user", content: prompt });

                    try {
                        const response = await fetch(`${this.baseUrl}${this.chatEndpoint}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                model: appData.janAI.model,
                                messages: messages,
                                temperature: 0.7, // Consider making configurable
                                max_tokens: 1500 // Adjust as needed
                            })
                        });

                        if (!response.ok) {
                            const errorBody = await response.text();
                            throw new Error(`API 요청 실패 (${response.status}): ${errorBody}`);
                        }

                        return await response.json();
                    } finally {
                        setAIProcessing(false); // Re-enable button
                    }
                }
            }
            const janAI = new JanAI();

            // --- Data Management ---
            // 기존 loadData 함수 내용을 아래 코드로 변경 (async 키워드 추가)
            const loadData = async () => {
                try {
                    //console.log('서버에서 데이터 로딩 시도...');
                    const response = await fetchWithAuth('/api/data'); // 세션 만료 처리 포함된 함수 사용
                    if (!response.ok) throw new Error(`데이터 로딩 실패: ${response.status} ${response.statusText}`);
                    const data = await response.json(); // 서버 응답(JSON) 받기
                    console.log('[loadData] 서버에서 받은 원본 데이터:', data); // <-- 디버깅 로그 추가

                    //console.log('서버에서 받은 원본 데이터:\', data);

                    // 태스크 데이터 처리
                    if (Array.isArray(data.tasks)) {
                        appData.tasks = data.tasks;
                        //console.log(`서버에서 ${data.tasks.length}개의 태스크 로드됨`);
                    } else {
                        console.warn('서버에서 태스크 데이터가 배열 형태가 아님:', data.tasks);
                        appData.tasks = [];
                    }
                    console.log('[loadData] appData.tasks 할당 후:', appData.tasks); // <-- 디버깅 로그 추가

                    // 컬럼 데이터 처리
                    if (Array.isArray(data.columns)) {
                        appData.columns = data.columns.map(col => ({
                            ...col,
                            order: col.ord || 0 // ord 속성이 없는 경우 기본값 0 설정
                        }));
                        //console.log(`서버에서 ${data.columns.length}개의 컬럼 로드됨:`, appData.columns);
                    } else {
                        console.warn('서버에서 컬럼 데이터가 배열 형태가 아님:', data.columns);
                        // 기본 컬럼 유지 (초기화 시 설정된 값)
                    }

                    //console.log('서버 데이터 로딩 완료. appData 상태:', appData);

                    // UI 업데이트
                    renderBoard(); // 화면 그리기
                    renderPgmHistory(); // PGM 탭 그리기
                } catch (error) {
                    // 세션 만료 오류는 이미 handleSessionExpired에서 처리
                    if (error.message === '세션 만료') return;

                    console.error("데이터 로드 오류:", error);
                    alert("데이터를 불러오는데 실패했습니다: " + error.message);

                    // 오류 발생시 테스트 데이터로 대체
                    console.log('오류 발생으로 테스트 데이터를 사용합니다.');
                    appData.tasks = [
                        {
                            id: '1065을 보소',
                            columnId: 'daily',
                            title: '첫 번째 할일',
                            description: '첫 번째 테스트 할일입니다.',
                            priority: 'high',
                            tags: ['중요', '테스트'],
                            completed: false
                        },

                    ];

                    // 기본 데이터로 화면 렌더링
                    renderBoard();
                    renderPgmHistory();
                }
                // 테마 적용
                applyTheme();
            };

            // --- 앱 초기화 함수 ---
            const init = async () => {
                //console.log("Initializing Task Board...");

                // 테마 설정 적용
                applyTheme();

                // 기본 이벤트 리스너 추가
                board.addEventListener('click', handleBoardClick);
                taskForm.addEventListener('submit', handleFormSubmit);
                searchInput.addEventListener('input', (e) => debouncedFilterTasks(e.target.value));
                themeToggle.addEventListener('click', toggleDarkMode);
                document.addEventListener('keydown', handleKeyDown);

                // 태그 입력 리스너
                tagInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (tagInput.value.trim()) {
                            addTag(tagInput.value);
                        }
                    }
                });

                // PGM 히스토리 탭의 서브 컬럼 버튼 이벤트 리스너 추가
                document.querySelectorAll('.sub-column-add-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const columnId = btn.dataset.columnTarget;
                        openTaskModal('add', columnId);
                    });
                });

                // PGM 히스토리 탭의 메뉴 버튼 이벤트 리스너 추가
                document.querySelectorAll('.sub-column-header .action-btn--menu').forEach(btn => {
                    btn.addEventListener('click', handleSubColumnMenuClick);
                });

                // --- 추가: PGM 히스토리 컨테이너 이벤트 리스너 ---
                const pgmHistoryContent = document.getElementById('pgm-history-content');
                if (pgmHistoryContent) {
                    pgmHistoryContent.addEventListener('click', (event) => {
                        const target = event.target;
                        const taskEl = target.closest('.task');
                        if (taskEl) {
                            const taskId = taskEl.dataset.taskId;
                            const actionTarget = target.closest('[data-action]');
                            const action = actionTarget?.dataset.action;

                            if (action === 'deleteTask') {
                                const task = getTaskDataById(taskId); // getTaskDataById는 전역 또는 app 객체 통해 접근 가능해야 함
                                if (task && confirm(`'${task.title}' 업무를 삭제하시겠습니까?`)) {
                                    deleteTask(taskId); // deleteTask는 전역 또는 app 객체 통해 접근 가능해야 함
                                }
                            } else if (action === 'toggleComplete') {
                                if (target.matches('.task__checkbox')) {
                                    toggleComplete(taskId); // toggleComplete는 전역 또는 app 객체 통해 접근 가능해야 함
                                }
                            } else if (action === 'openDetail') {
                                 if (!target.matches('.task__checkbox') && !target.matches('.task__delete-btn')) {
                                     openDetailModal(taskId); // openDetailModal은 전역 또는 app 객체 통해 접근 가능해야 함
                                 }
                            }
                        }
                    });
                }
                // --- // 추가: PGM 히스토리 컨테이너 이벤트 리스너 ---

                // 태브 기능 활성화
                document.querySelectorAll('.tabs__tab').forEach((tab, index) => {
                    tab.addEventListener('click', function() {
                        tabManager.activateTab(index);
                    });
                });

                // AI 인터페이스 리스너 설정 (Jan.AI가 있다면)
                if (typeof janAI !== 'undefined') {
                    aiModelSelector.addEventListener('change', (e) => {
                        const selectedModel = e.target.value;
                        if (selectedModel && appData.janAI.availableModels.some(m => m.id === selectedModel)) {
                            appData.janAI.model = selectedModel;
                        }
                    });

                    toggleAI.addEventListener('click', () => {
                        const isActive = aiInterface.classList.toggle('active');
                        aiInterface.setAttribute('aria-hidden', !isActive);
                        if (isActive) aiPrompt.focus();
                    });

                    closeAI.addEventListener('click', () => {
                        aiInterface.classList.remove('active');
                        aiInterface.setAttribute('aria-hidden', 'true');
                    });

                    executeAI.addEventListener('click', () => {
                        if (typeof processAICommand === 'function') {
                            processAICommand(aiPrompt.value.trim());
                        }
                    });

                    aiPrompt.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            executeAI.click();
                        }
                    });

                    if (typeof organizeTasksWithAI === 'function') {
                        aiOrganize.addEventListener('click', organizeTasksWithAI);
                    }

                    aiSuggestions.addEventListener('click', (e) => {
                        const suggestion = e.target.closest('.ai-suggestion');
                        if (suggestion) {
                            const promptText = suggestion.dataset.prompt || suggestion.textContent;
                            aiPrompt.value = promptText;
                            aiPrompt.focus();
                        }
                    });

                    // AI 연결 확인 시도 (에러는 무시)
                    try {
                        await janAI.checkConnection();
                    } catch (err) {
                        console.warn("Jan AI 연결 확인 실패:", err);
                    }
                }

                // 서버에서 데이터 로드 시도
                try {
                    await loadData();
                    //console.log("데이터 로드 완료, 화면 렌더링됨");
                } catch (error) {
                    console.error("데이터 로드 중 오류:", error);
                    // loadData 내에서 이미 오류 처리 및 기본 데이터 설정함
                }

                //console.log("Task Board 초기화 완료.");
            };

            // --- Utility Functions For UI ---
            const saveSettings = () => {
                try {
                    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(appData.settings));
                } catch (e) {
                    console.error("설정 저장 오류:", e);
                    // Less critical, maybe just log
                }
            };

            // --- Theme & Settings Application ---
            const applyTheme = () => {
                document.body.classList.toggle('theme-dark', appData.settings.darkMode);
                themeToggle.textContent = appData.settings.darkMode ? '☀️' : '🌙';
                themeToggle.setAttribute('aria-label', appData.settings.darkMode ? '라이트 모드 전환' : '다크 모드 전환');

                 // --- 중요: 초기 탭 상태 설정 및 보드 가시성 제어 ---
                 // 초기 로드 시 기본 탭(보통 첫 번째 탭)을 활성화합니다.
                 // tabManager가 이 시점에 정의되어 있어야 함!
                 const initialActiveTabIndex = Array.from(tabManager.tabs).findIndex(tab => tab.classList.contains('tabs__tab--active'));
                 tabManager.activateTab(initialActiveTabIndex >= 0 ? initialActiveTabIndex : 0); // 현재 활성 탭 또는 첫 번째 탭 활성화
            }

            const toggleDarkMode = () => {
                appData.settings.darkMode = !appData.settings.darkMode;
                applyTheme();
                saveSettings();
            };

            const applyQuickAddVisibility = () => {
                // TODO: If quick add toggle is implemented, update visibility here
                const quickAddElements = board.querySelectorAll('.column__quick-add');
                 quickAddElements.forEach(el => {
                     el.style.display = appData.settings.showQuickAdd ? 'block' : 'none'; // Direct style for now
                 });
            };

            // --- Rendering ---
            const getTaskDataById = (id) => appData.tasks.find(task => task.id === id);
            const getColumnElementById = (id) => board.querySelector(`.column[data-column-id="${id}"]`);
            const getColumnTitleElement = (columnId) => getColumnElementById(columnId)?.querySelector('.column__title');

            const createTaskElement = (task) => {
                const taskEl = document.createElement('div');
                taskEl.className = `task task--priority-${task.priority || 'medium'}`;
                taskEl.setAttribute('draggable', true);
                taskEl.dataset.taskId = task.id;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'task__checkbox';
                checkbox.checked = task.completed;
                checkbox.dataset.action = 'toggleComplete';
                checkbox.setAttribute('aria-label', `업무 ${task.completed ? '미완료로' : '완료로'} 표시: ${task.title}`);

                // 체크박스에 change 이벤트 리스너 추가 - 실시간 시각적 피드백 위함
                checkbox.addEventListener('change', (e) => {
                    const titleEl = taskEl.querySelector('.task__title');
                    if (titleEl) {
                        titleEl.classList.toggle('task__title--completed', e.target.checked);
                    }
                });

                taskEl.appendChild(checkbox);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'task__content';

                const titleEl = document.createElement('div');
                titleEl.className = `task__title ${task.completed ? 'task__title--completed' : ''}`;
                titleEl.textContent = task.title;
                titleEl.dataset.action = 'openDetail'; // Changed from openEdit to openDetail by default
                contentDiv.appendChild(titleEl);

                const metaEl = document.createElement('div');
                metaEl.className = 'task__meta';

                const dueDateEl = document.createElement('div');
                dueDateEl.className = `task__meta-item ${utils.getDueDateClass(task.dueDate)}`;
                dueDateEl.innerHTML = `<span>🗓️</span> ${utils.formatDueDateForDisplay(task.dueDate)}`;
                metaEl.appendChild(dueDateEl);

                if (task.assignees) {
                    const assigneesEl = document.createElement('div');
                    assigneesEl.className = 'task__meta-item';
                    assigneesEl.innerHTML = `<span>👤</span> ${utils.escapeHtml(task.assignees)}`;
                    metaEl.appendChild(assigneesEl);
                }
                contentDiv.appendChild(metaEl);

                if (task.tags && task.tags.length > 0) {
                    const tagsEl = document.createElement('div');
                    tagsEl.className = 'task__tags';
                    task.tags.forEach(tag => {
                        const tagEl = document.createElement('span');
                        tagEl.className = 'task__tag';
                        tagEl.textContent = utils.escapeHtml(tag);
                        tagsEl.appendChild(tagEl);
                    });
                    contentDiv.appendChild(tagsEl);
                }
                taskEl.appendChild(contentDiv);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'task__delete-btn';
                deleteBtn.innerHTML = '×';
                deleteBtn.dataset.action = 'deleteTask';
                deleteBtn.setAttribute('aria-label', `업무 삭제: ${task.title}`);
                taskEl.appendChild(deleteBtn);

                taskEl.addEventListener('dragstart', handleDragStart);
                taskEl.addEventListener('dragend', handleDragEnd);
                taskEl.addEventListener('dblclick', () => openTaskModal('edit', null, task.id)); // Double click to edit

                return taskEl;
            };

            const renderBoard = () => {
                console.log('renderBoard 함수 호출됨. 현재 appData 상태:', {
                    columns: appData.columns.length,
                    tasks: appData.tasks.length
                });

                board.innerHTML = ''; // Clear board

                // 컬럼이 없으면 메시지 표시
                if (!appData.columns || appData.columns.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.className = 'empty-board-message';
                    emptyMsg.textContent = '컬럼 데이터가 없습니다. 서버 연결을 확인해주세요.';
                    board.appendChild(emptyMsg);
                    console.warn('렌더링할 컬럼 데이터가 없음');
                    return;
                }

                const sortedColumns = [...appData.columns].sort((a, b) => (a.order || 0) - (b.order || 0));
                //console.log('정렬된 컬럼:', sortedColumns);

                sortedColumns.forEach(column => {
                    const columnEl = document.createElement('div');
                    columnEl.className = 'column';
                    columnEl.dataset.columnId = column.id;

                    if (column.id === 'welldone') {
                        columnEl.classList.add('column--completed');
                    }

                    // --- Header ---
                    const headerEl = document.createElement('div');
                    headerEl.className = 'column__header';

                    const titleAreaEl = document.createElement('div');
                    titleAreaEl.className = 'column__title-area';

                    const titleEl = document.createElement('span');
                    titleEl.className = 'column__title';
                    titleEl.textContent = column.title;
                    titleEl.title = "더블클릭하여 이름 수정"; // Tooltip
                    //titleEl.addEventListener('dblclick', () => startEditingColumnTitle(titleAreaEl)); // Double click to edit title

                    const counterEl = document.createElement('span');
                    counterEl.className = 'column__counter';
                    counterEl.setAttribute('aria-live', 'polite'); // Announce changes

                    titleAreaEl.appendChild(titleEl);
                    titleAreaEl.appendChild(counterEl);

                    headerEl.appendChild(titleAreaEl);

                    const actionsEl = document.createElement('div');
                    actionsEl.className = 'column__actions';

                    const addBtn = document.createElement('button');
                    addBtn.className = 'action-btn action-btn--add';
                    addBtn.dataset.action = 'addTask';
                    addBtn.dataset.columnTarget = column.id;
                    addBtn.setAttribute('aria-label', `${column.title} 컬럼에 새 업무 추가`);
                    addBtn.textContent = '+';
                    actionsEl.appendChild(addBtn);

                    const menuBtn = document.createElement('button');
                    menuBtn.className = 'action-btn action-btn--menu';
                    menuBtn.dataset.action = 'openColumnMenu';
                    menuBtn.dataset.columnTarget = column.id;
                    menuBtn.setAttribute('aria-label', `${column.title} 컬럼 메뉴 열기`);
                    menuBtn.textContent = '⋮';
                    actionsEl.appendChild(menuBtn);

                    headerEl.appendChild(actionsEl);
                    columnEl.appendChild(headerEl);

                    // --- Content ---
                    const contentEl = document.createElement('div');
                    contentEl.className = 'column__content';
                    contentEl.dataset.columnId = column.id;
                    contentEl.addEventListener('dragover', handleDragOver);
                    contentEl.addEventListener('dragleave', handleDragLeave);
                    contentEl.addEventListener('drop', handleDrop);

                    // 태스크 필터링 및 정렬
                    const tasksForColumn = appData.tasks.filter(task => task.columnId === column.id);
                    console.log(`컬럼 ${column.id}의 태스크 수: ${tasksForColumn.length}`);

                    const sortedTasks = [...tasksForColumn].sort((a, b) => {
                        // 날짜 기준 정렬 (없으면 맨 뒤로)
                        const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
                        const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
                        return dateA - dateB;
                    });

                    if (sortedTasks.length === 0) {
                        contentEl.appendChild(createEmptyState());
                    } else {
                        sortedTasks.forEach(task => {
                            try {
                                const taskEl = createTaskElement(task);
                                contentEl.appendChild(taskEl);
                            } catch (error) {
                                console.error(`태스크 렌더링 오류 (ID: ${task.id}):`, error, task);
                            }
                        });
                    }

                    columnEl.appendChild(contentEl);

                    // Update counter after tasks are added
                    counterEl.textContent = sortedTasks.length;

                    // --- Quick Add ---
                    if (appData.settings.showQuickAdd) {
                        const quickAddEl = document.createElement('div');
                        quickAddEl.className = 'column__quick-add';
                        quickAddEl.style.display = appData.settings.showQuickAdd ? 'block' : 'none'; // Direct style for now

                        const inputEl = document.createElement('input');
                        inputEl.className = 'column__quick-add-input';
                        inputEl.placeholder = '빠른 추가 (Enter)';
                        inputEl.dataset.columnId = column.id;
                        inputEl.setAttribute('aria-label', `${column.title}에 빠른 업무 추가`);

                        inputEl.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                                const newTitle = e.target.value.trim();
                                addTask({
                                    columnId: column.id,
                                    title: newTitle,
                                });
                                e.target.value = '';
                                utils.showFeedback(`'${newTitle}' 업무 추가됨`);
                            }
                        });
                        quickAddEl.appendChild(inputEl);
                        columnEl.appendChild(quickAddEl);
                    }

                    board.appendChild(columnEl);
                });

                // Re-apply search filter if needed
                const currentSearchTerm = searchInput.value.trim();
                if (currentSearchTerm) {
                    filterTasks(currentSearchTerm);
                }

                //console.log('보드 렌더링 완료');
            };


             const renderPgmHistory = () => {
                 console.log('[renderPgmHistory] 함수 호출됨. 현재 appData.tasks:', appData.tasks); // <-- 디버깅 로그 추가

                 const pgmSubColumns = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink']; // 변수 정의

                 pgmSubColumns.forEach(subColumnId => {
                     const contentEl = getPgmSubColumnContentElement(subColumnId); // Find content element directly by ID (e.g., "AVI-red-content")
                     console.log(`[renderPgmHistory] 처리 중인 서브 컬럼: ${subColumnId}. contentEl 발견 여부:`, !!contentEl); // <-- 디버깅 로그 추가

                     if (contentEl) {
                         contentEl.innerHTML = ''; // Clear previous content

                         // Get tasks for this sub-column using global appData
                         const tasks = appData.tasks.filter(task => task.columnId === subColumnId);
                         console.log(`[renderPgmHistory] ${subColumnId} 에 대한 필터링된 태스크 수: ${tasks.length}`, tasks); // <-- 디버깅 로그 추가

                         if (tasks.length === 0) {
                             const emptyState = createEmptyState();
                             contentEl.appendChild(emptyState);
                         } else {
                             tasks.forEach(task => {
                                 try {
                                     // Use global createTaskElement directly
                                     const taskEl = createTaskElement(task);
                                     contentEl.appendChild(taskEl);
                                     // console.log(`[renderPgmHistory] Appended task ${task.id} to ${subColumnId}`);
                                 } catch (error) {
                                     console.error(`[renderPgmHistory] Error creating task element for ${task.id}:`, error);
                                 }
                             });
                         }

                         // Setup listeners for the content area if needed (e.g., click)
                         // Example: contentEl.addEventListener('click', handlePgmContentClick);
                         // Ensure to remove old listeners if re-rendering to avoid duplicates
                         // Example: contentEl.removeEventListener('click', handlePgmContentClick);
                     } else {
                         console.warn(`PGM sub-column content element not found for ID: ${subColumnId}`);
                     }
                 });

                 // Event listeners for sub-column menus are likely attached elsewhere or during initial setup.
                 // Re-attaching them here might cause issues if not managed carefully.
                 // If menus need dynamic listeners, ensure proper add/remove logic.

                 // console.log("[renderPgmHistory] 함수 종료됨."); // 주석 처리
             };

            // --- PGM Column Click Handler (Event Delegation) ---
            const handlePgmColumnClick = (event) => {
                const target = event.target;
                const taskEl = target.closest('.task');

                if (!taskEl) return; // Click wasn't inside a task

                const taskId = taskEl.dataset.taskId;
                const actionTarget = target.closest('[data-action]');
                const action = actionTarget?.dataset.action;

                console.log(`[handlePgmColumnClick] Click detected on task ${taskId}. Action target:`, actionTarget, `Action: ${action}`);

                if (action === 'deleteTask') {
                    const task = app.getTaskDataById(taskId);
                    if (task && confirm(`'${task.title}' 업무를 삭제하시겠습니까?`)) {
                        deleteTask(taskId);
                    }
                } else if (action === 'toggleComplete') {
                    // Checkbox click
                    if (target.matches('.task__checkbox')) {
                        toggleComplete(taskId);
                    }
                } else if (action === 'openDetail') {
                    // Open detail modal when clicking title or general task area
                    if (!target.matches('.task__checkbox') && !target.matches('.task__delete-btn')) {
                        openDetailModal(taskId);
                    }
                }
            };

            // 서브 컬럼 메뉴 버튼 클릭 핸들러
            const handleSubColumnMenuClick = (event) => {
                event.stopPropagation(); // 이벤트 버블링 방지
                const btn = event.currentTarget;
                const columnId = btn.dataset.columnTarget;
                if (columnId) {
                    showColumnMenu(btn, columnId);
                }
            };

            // --- JanAI 클래스 외부 ---

            const createEmptyState = () => {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.textContent = '업무가 없습니다';
                return emptyState;
            };

            const updateColumnCounter = (columnId) => {
                const column = getColumnElementById(columnId);
                if (column) {
                    const counter = column.querySelector('.column__counter');
                    const content = column.querySelector('.column__content');
                    const taskCount = content ? content.querySelectorAll('.task').length : 0;
                    if (counter) counter.textContent = taskCount;

                    // Toggle empty state
                    const emptyState = content.querySelector('.empty-state');
                    if (taskCount === 0 && !emptyState) {
                        content.appendChild(createEmptyState());
                    } else if (taskCount > 0 && emptyState) {
                        emptyState.remove();
                    }
                }
            };

            // --- Task Management ---
            // 기존 addTask 함수 내용을 아래 코드로 변경 (async 키워드 추가)
            const addTask = async (taskData) => {
                const newTask = {
                    id: utils.generateId(), // 새 ID 생성
                    completed: false,
                    priority: 'medium',
                    ...taskData // title, columnId 등 포함
                };

                try {
                    console.log('[addTask] 서버로 전송할 newTask 객체:', newTask); // <-- 디버깅 로그 추가
                    const response = await fetchWithAuth('/api/tasks', { // fetchWithAuth로 변경
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newTask) // 새 태스크 정보 전송
                    });
                    if (!response.ok) throw new Error('태스크 추가 실패');
                    const addedTask = await response.json(); // 서버에서 최종 데이터 받기

                    // 성공 시: 로컬 데이터 업데이트 및 화면 업데이트
                    appData.tasks.push(addedTask);
                    renderSingleTask(addedTask); // 화면에 새 태스크 추가 (도우미 함수 필요, 아래 참고)
                    updateColumnCounter(addedTask.columnId); // 카운터 업데이트
                    // utils.showFeedback(...) // 성공 피드백
+                   console.log('[addTask] 태스크 추가 후 appData.tasks:', appData.tasks); // <-- 디버깅 로그 추가

                } catch (error) {
                    // 세션 만료 오류는 이미 handleSessionExpired에서 처리
                    if (error.message === '세션 만료') return;

                    console.error("태스크 추가 오류:", error);
                    alert("태스크 추가에 실패했습니다.");
                }
                // saveData() 호출 삭제!
            };

            // 기존 updateTask 함수 내용을 아래 코드로 변경 (async 키워드 추가)
            const updateTask = async (taskId, updatedData) => {
                // tags는 currentTags 사용 (모달 상태)
                const payload = { ...updatedData, tags: currentTags };

                try {
                    const response = await fetchWithAuth(`/api/tasks/${taskId}`, { // fetchWithAuth로 변경
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload) // 수정할 내용 전송
                    });
                    if (!response.ok) throw new Error('태스크 수정 실패');
                    const returnedTask = await response.json(); // 서버 응답 받기

                    // 성공 시: 로컬 데이터 업데이트 및 화면 업데이트
                    const taskIndex = appData.tasks.findIndex(task => task.id === taskId);
                    if (taskIndex > -1) {
                        // 서버 응답 대신, 보낸 데이터 기준으로 로컬 업데이트
                        appData.tasks[taskIndex] = { ...appData.tasks[taskIndex], ...payload };
                        rerenderSingleTask(taskId); // 화면 업데이트 (도우미 함수 필요, 아래 참고)
                    }
                    // utils.showFeedback(...) // 성공 피드백
                } catch (error) {
                    // 세션 만료 오류는 이미 handleSessionExpired에서 처리
                    if (error.message === '세션 만료') return;

                    console.error("태스크 수정 오류:", error);
                    alert("작성자만 수정 할수있습니다.");
                }
                currentTags = []; // 모달 태그 초기화
                // saveData() 호출 삭제!
            };

            // 기존 deleteTask 함수 내용을 아래 코드로 변경 (async 키워드 추가)
            const deleteTask = async (taskId) => {
                try {
                    const response = await fetchWithAuth(`/api/tasks/${taskId}`, { // fetchWithAuth로 변경
                        method: 'DELETE'
                    });
                    if (!response.ok) throw new Error('태스크 삭제 실패');
                    const result = await response.json(); // 서버 응답 받기

                    // 성공 시: 로컬 데이터 업데이트 및 화면 업데이트
                    const taskIndex = appData.tasks.findIndex(task => task.id === taskId);
                    if (taskIndex > -1) {
                        const deletedTask = appData.tasks.splice(taskIndex, 1)[0];
                        const columnId = deletedTask.columnId;
                        // 화면에서 요소 제거
                        const taskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);
                        if (taskEl) taskEl.remove();
                        else renderPgmHistory(); // PGM 탭에만 있었다면 해당 탭 갱신
                        updateColumnCounter(columnId); // 카운터 업데이트
                        // utils.showFeedback(...) // 성공 피드백
                    }
                } catch (error) {
                    // 세션 만료 오류는 이미 handleSessionExpired에서 처리
                    if (error.message === '세션 만료') return;

                    console.error("태스크 삭제 오류:", error);
                    alert("작성자만 수정, 삭제할 수 있습니다.");
                }
                // saveData() 호출 삭제!
            };

            // 기존 toggleComplete 함수 내용을 아래 코드로 변경 (async 키워드 추가)
            const toggleComplete = async (taskId) => {
                const taskIndex = app.appData.tasks.findIndex(task => task.id === taskId);
                if (taskIndex === -1) {
                    console.error(`[toggleComplete] Task ID ${taskId} not found in local appData.tasks.`);
                    return;
                }

                const task = { ...app.appData.tasks[taskIndex] }; // Work with a copy for modifications
                const newCompletedStatus = !task.completed;
                let newColumnId = task.columnId; // Start with current columnId
                let newOriginalColumnIdBeforeCompletion = task.originalColumnIdBeforeCompletion; // Start with current

                const welldoneColumnId = 'welldone';
                const updatePayload = { completed: newCompletedStatus };

                if (newCompletedStatus) { // Task is being marked as COMPLETED
                    if (task.columnId !== welldoneColumnId) { // Only move if not already in welldone
                        newOriginalColumnIdBeforeCompletion = task.columnId; // Store current column
                        newColumnId = welldoneColumnId;                   // Target 'welldone'
                        updatePayload.originalColumnIdBeforeCompletion = newOriginalColumnIdBeforeCompletion;
                        updatePayload.columnId = newColumnId;
                    }
                    // If already in welldone and being marked complete, no column change, just status.
                } else { // Task is being marked as INCOMPLETE
                    if (task.columnId === welldoneColumnId && task.originalColumnIdBeforeCompletion) {
                        // If in welldone and has an original column, move it back
                        newColumnId = task.originalColumnIdBeforeCompletion;
                        newOriginalColumnIdBeforeCompletion = null; // Clear it as it's no longer 'pending return'
                        updatePayload.columnId = newColumnId;
                        updatePayload.originalColumnIdBeforeCompletion = null;
                    } else if (task.columnId === welldoneColumnId && !task.originalColumnIdBeforeCompletion) {
                        // If in welldone, being unchecked, but has NO original column (e.g., created directly in welldone)
                        // It should remain in welldone, just uncompleted.
                        // No change to columnId or originalColumnIdBeforeCompletion needed beyond what's in task.
                    }
                }

                try {
                    const response = await fetchWithAuth(`/api/tasks/${taskId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatePayload)
                    });

                    if (!response.ok) {
                        const errorBody = await response.text();
                        throw new Error(`완료 상태 변경 및 이동 실패: ${errorBody}`);
                    }
                    const updatedTaskFromServer = await response.json();

                    // Update local task data with the full response from the server
                    app.appData.tasks[taskIndex] = { ...app.appData.tasks[taskIndex], ...updatedTaskFromServer };

                    const currentTaskStateInApp = app.appData.tasks[taskIndex]; // Use the updated state from appData

                    // UI update:
                    const taskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);

                    if (taskEl) {
                        const checkbox = taskEl.querySelector('.task__checkbox');
                        if (checkbox) checkbox.checked = currentTaskStateInApp.completed;
                        taskEl.querySelector('.task__title')?.classList.toggle('task__title--completed', currentTaskStateInApp.completed);
                    }

                    if (task.columnId !== currentTaskStateInApp.columnId) { // Check if column actually changed
                        // Column move occurred, handle DOM manipulation
                        if (taskEl && taskEl.parentElement) {
                            const oldColumnContentEl = taskEl.parentElement;
                            const oldColumnId = task.columnId; // This is the ID of the column *before* the update
                            taskEl.remove(); // Remove from old DOM column

                            // Update old column (counter, empty state)
                            if (PGM_COLUMN_IDS.includes(oldColumnId)) {
                                if (oldColumnContentEl.children.length === 0 && !oldColumnContentEl.querySelector('.empty-state')) {
                                    oldColumnContentEl.appendChild(createEmptyState());
                                }
                            } else { // Dashboard column
                                app.updateColumnCounter(oldColumnId);
                                if (!oldColumnContentEl.querySelector('.task:not([style*="display: none"])') && !oldColumnContentEl.querySelector('.empty-state')) {
                                    oldColumnContentEl.appendChild(createEmptyState());
                                }
                            }
                        }

                        // Add to new DOM column
                        const targetNewColumnId = currentTaskStateInApp.columnId;
                        const newColumnContentEl = PGM_COLUMN_IDS.includes(targetNewColumnId) ?
                                                   getPgmSubColumnContentElement(targetNewColumnId) :
                                                   getColumnContentElement(targetNewColumnId);

                        if (newColumnContentEl) {
                            const emptyState = newColumnContentEl.querySelector('.empty-state');
                            if (emptyState) emptyState.remove();

                            const freshTaskEl = app.createTaskElement(currentTaskStateInApp); // Create element with latest data
                            newColumnContentEl.appendChild(freshTaskEl);

                            if (!PGM_COLUMN_IDS.includes(targetNewColumnId)) {
                                app.updateColumnCounter(targetNewColumnId);
                            }
                        } else {
                            console.warn(`Target column ${targetNewColumnId} not found in DOM. Full render might be needed.`);
                            app.renderBoard();
                            app.renderPgmHistory();
                        }
                    } else {
                        // Column did not change, just re-render the task in place if it exists
                        if(taskEl) {
                            rerenderSingleTask(taskId);
                        }
                    }
                } catch (error) {
                    if (error.message === '세션 만료') return; // Already handled by fetchWithAuth
                    console.error("완료 상태 변경 중 오류:", error);
                    alert("작업 완료 상태 변경 또는 이동에 실패했습니다: " + error.message + "\n문제가 지속되면 페이지를 새로고침 해주세요.");
                    // Rollback local data to pre-API call state
                    app.appData.tasks[taskIndex] = task; // Restore the original task object copy
                    // Force re-render to reflect original state
                    app.renderBoard();
                    app.renderPgmHistory();
                }
            };

                // 기존 moveTask 함수 내용을 아래 코드로 변경 (async 키워드 추가)
                const moveTask = async (taskId, targetColumnId, insertBeforeTaskId = null) => {
                    const taskIndex = app.appData.tasks.findIndex(t => t.id === taskId);
                    if (taskIndex === -1) return;
                    const originalColumnId = app.appData.tasks[taskIndex].columnId;

                    // UI는 드래그 종료 시 이미 이동된 상태일 수 있음 (Optimistic UI)

                    try {
                        const response = await fetchWithAuth(`/api/tasks/${taskId}`, { // fetchWithAuth로 변경
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ columnId: targetColumnId }) // 새 컬럼 ID 전송
                        });
                        if (!response.ok) throw new Error('태스크 이동 실패');

                        // 성공 시: 로컬 데이터 업데이트
                        app.appData.tasks[taskIndex].columnId = targetColumnId;
                        // UI 카운터 업데이트
                        updateColumnCounter(originalColumnId);
                        updateColumnCounter(targetColumnId);

                    } catch (error) {
                        console.error("태스크 이동 오류:", error);
                        alert("태스크 이동에 실패했습니다.");
                        // 실패 시 UI 원복 필요 (renderBoard(), renderPgmHistory() 호출 등)
                        renderBoard();
                        renderPgmHistory();
                    }
                    // saveData() 호출 삭제!
                };

            // --- Column Management ---
            const startEditingColumnTitle = (titleContainer) => {
                const titleSpan = titleContainer.querySelector('.column__title');
                // Prevent editing if already editing
                if (titleContainer.querySelector('.column__title-input')) return;

                const currentTitle = titleSpan.textContent;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = currentTitle;
                input.className = 'column__title-input';
                input.setAttribute('aria-label', '컬럼 이름 수정');

                titleSpan.style.display = 'none'; // Hide span
                titleContainer.insertBefore(input, titleSpan.nextSibling); // Insert input after span
                input.focus();
                input.select();

                const finishEditing = (save = true) => {
                    const columnId = titleContainer.closest('.column').dataset.columnId;
                    const newTitle = save ? input.value.trim() : currentTitle;

                    input.remove(); // Remove input first
                    titleSpan.style.display = ''; // Show span again

                    if (save && newTitle && newTitle !== currentTitle) {
                        updateColumnTitle(columnId, newTitle);
                        const columnElement = getColumnElementById(columnId);
                        columnElement.querySelector('.action-btn--add')?.setAttribute('aria-label', `${newTitle} 컬럼에 새 업무 추가`);
                        columnElement.querySelector('.action-btn--menu')?.setAttribute('aria-label', `${newTitle} 컬럼 메뉴 열기`);
                    } else {
                        titleSpan.textContent = currentTitle;
                    }
                };

                const handleBlur = () => finishEditing();
                const handleInputKeydown = (e) => {
                    if (e.key === 'Enter') finishEditing();
                    else if (e.key === 'Escape') finishEditing(false);
                };

                input.addEventListener('blur', handleBlur, { once: true }); // Use once to auto-remove
                input.addEventListener('keydown', handleInputKeydown);
            };

            const updateColumnTitle = (columnId, newTitle) => {
                const column = appData.columns.find(c => c.id === columnId);
                if (column && newTitle) {
                    column.title = newTitle;
                    saveData();
                    const titleEl = getColumnTitleElement(columnId);
                    if (titleEl) titleEl.textContent = newTitle;
                }
            };

            /*const deleteCompletedTasks = (columnId) => {    완료항목전체삭제제
                const columnTitle = getColumnTitleElement(columnId)?.textContent || `컬럼 ${columnId}`;
                const completedTasks = appData.tasks.filter(task => task.columnId === columnId && task.completed);

                if (completedTasks.length === 0) {
                    utils.showFeedback(`${columnTitle}에 완료된 항목이 없습니다.`);
                    return;
                }

                if (confirm(`${columnTitle}의 완료된 항목 ${completedTasks.length}개를 삭제하시겠습니까?`)) {
                    const initialLength = appData.tasks.length;
                    appData.tasks = appData.tasks.filter(task => !(task.columnId === columnId && task.completed));
                    if (appData.tasks.length < initialLength) {
                        saveData();
                        renderBoard(); // Re-render needed
                        utils.showFeedback(`${columnTitle}에서 ${completedTasks.length}개의 완료된 항목을 삭제했습니다.`);
                    }
                }
            };*/

            /*const deleteAllTasksFromColumn = (columnId) => { 천체삭제제
                const columnTitle = getColumnTitleElement(columnId)?.textContent || `컬럼 ${columnId}`;
                const tasksInColumn = appData.tasks.filter(task => task.columnId === columnId).length;

                if (tasksInColumn === 0) {
                    utils.showFeedback(`${columnTitle}에 삭제할 항목이 없습니다.`);
                    return;
                }

                if (confirm(`${columnTitle}의 모든 항목(${tasksInColumn}개)을 삭제하시겠습니까?`)) {
                    appData.tasks = appData.tasks.filter(task => task.columnId !== columnId);
                    saveData();
                    renderBoard(); // Re-render needed
                    utils.showFeedback(`${columnTitle}의 모든 항목 ${tasksInColumn}개를 삭제했습니다.`);
                }
            };*/

              // processAICommand 함수 내 수정
                // AI 처리 중 UI 상태 관리
                const setAIProcessing = (isProcessing) => {
                    executeAI.disabled = isProcessing;
                    executeAI.textContent = isProcessing ? '처리중...' : '실행';
                    aiPrompt.disabled = isProcessing;

                    // 처리 중일 때 시각적 표시 추가
                    if (isProcessing) {
                        aiResponse.innerHTML = "<div class='ai-thinking'>🤔 생각 중입니다...</div>";
                    }
                };

                // AI 명령어 처리 - 개선된 프롬프트 엔지니어링
                const processAICommand = async (prompt) => {
                    if (!prompt || prompt.trim() === "") {
                        aiResponse.innerHTML = "<div class='ai-error'>명령어를 입력해주세요.</div>";
                        return;
                    }

                    setAIProcessing(true);

                    try {
                        // 사용자 명령어 분석 및 의도 파악
                        const commandType = await analyzeCommandIntent(prompt);

                        // 명령어 유형에 따라 적절한 처리 수행
                        switch(commandType.type) {
                            case 'search':
                                await handleSearchCommand(prompt, commandType.keywords);
                                break;
                            case 'add':
                                await handleAddCommand(prompt, commandType.details);
                                break;
                            case 'update':
                                await handleUpdateCommand(prompt, commandType.taskInfo);
                                break;
                            case 'delete':
                                await handleDeleteCommand(prompt, commandType.taskInfo);
                                break;
                            case 'move':
                                await handleMoveCommand(prompt, commandType.taskInfo);
                                break;
                            case 'organize':
                                await handleOrganizeCommand(prompt);
                                break;
                            case 'date':
                                await handleDateCommand(prompt, commandType.dateInfo);
                                break;
                            case 'unknown':
                                default:
                                await handleGenericCommand(prompt);
                        }
                    } catch (error) {
                        console.error("AI 명령어 처리 중 오류:", error);
                        const errorMessage = error.message || "AI 처리 중 알 수 없는 오류 발생";
                        aiResponse.innerHTML = `<div class='ai-error'>⚠️ ${utils.escapeHtml(errorMessage)}</div>`;
                    } finally {
                        setAIProcessing(false);
                    }
                };

                // 명령어 의도 분석 - 작은 모델에서도 잘 작동하는 간결한 프롬프트
                const analyzeCommandIntent = async (prompt) => {
                    const systemMessage = `
                    당신은 업무 관리 앱에 통합된 AI 비서입니다. 사용자의 입력을 분석하여 무엇을 하려는지 의도를 파악해주세요.
                    가능한 의도 유형: search(검색/찾기), add(추가/생성), update(수정/변경), delete(삭제), move(이동), organize(정리/정돈), date(마감일), unknown(기타),

                    JSON 형식으로 다음과 같이 간결하게 응답해주세요:
                    {
                    "type": "의도유형",
                    "keywords": ["관련키워드1", "관련키워드2"], // 검색어 또는 중요 단어
                    "details": {}, // 추가할 업무 정보(add 타입일 경우)
                    "taskInfo": {}, // 작업 관련 정보(update, delete, move 타입일 경우)
                    "dateInfo": { // date 타입일 경우
                        "action": "search/update/tag", // 찾기/수정/태그추가 등
                        "condition": "overdue/today/tomorrow/thisWeek" // 마감일 조건
                        }
                    }

                    예시 의도 파악:
                    - "홍길동 담당 업무 찾아줘" → {"type": "search", "keywords": ["홍길동", "담당"]}
                    - "프로젝트 기획 업무 추가해줘" → {"type": "add", "details": {"title": "프로젝트 기획"}}
                    - "보고서 마감일 다음 주로 변경" → {"type": "update", "taskInfo": {"title": "보고서", "field": "dueDate"}}
                    - "마감일 지난 업무 찾아줘" → {"type": "date", "keywords": ["마감일", "지난"], "dateInfo": {"action": "search", "condition": "overdue"}}
                    `;

                    try {
                        const response = await janAI.sendPrompt(prompt, systemMessage);
                        const aiContent = response?.choices?.[0]?.message?.content;

                        if (!aiContent) throw new Error("의도 분석 응답을 받지 못했습니다.");

                        // JSON 부분 추출 및 파싱
                        const jsonMatch = aiContent.match(/{[\s\S]*}/);
                        if (jsonMatch) {
                            try {
                                return JSON.parse(jsonMatch[0]);
                            } catch (parseError) {
                                console.warn("의도 분석 JSON 파싱 실패:", parseError);
                                // 기본값 반환
                                return { type: "unknown" };
                            }
                        } else {
                            return { type: "unknown" };
                        }
                     }
                 catch (error) {
                        console.error("의도 분석 오류:", error);
                        return { type: "unknown" };
                     }
                };

                // 검색 명령어 처리 - 작은 모델에 최적화
                const handleSearchCommand = async (originalPrompt, keywords) => {
                    // 검색 관련 task만 필터링하여 컨텍스트 제공
                    const relevantTasks = appData.tasks.filter(task => {
                        const searchableText = [
                            task.title || "",
                            task.description || "",
                            task.assignees || "",
                            (task.tags || []).join(" ")
                        ].join(" ").toLowerCase();

                        return keywords.some(keyword =>
                            searchableText.includes(keyword.toLowerCase())
                        );
                    });

                    // 검색 결과 개수에 따라 다른 프롬프트 사용
                    const systemMessage = relevantTasks.length > 0
                        ? `
                다음은 '${keywords.join(", ")}' 키워드와 관련된 업무 목록입니다:
                ${JSON.stringify(relevantTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    assignees: t.assignees,
                    dueDate: t.dueDate,
                    priority: t.priority,
                    completed: t.completed,
                    columnId: t.columnId
                })))}

                사용자 질문: "${originalPrompt}"

                위 정보를 바탕으로 사용자 질문에 정확히 답변해주세요.
                반환 형식은 다음과 같습니다:
                {
                "message": "검색 결과에 대한 간결한 답변 (한국어)",
                "requires_confirmation": false,
                "proposed_actions": [
                    {
                    "type": "info",
                    "payload": {
                        "details": [검색된 업무 목록 또는 정보]
                    }
                    }
                ]
                }
                `
                        : `
                '${keywords.join(", ")}' 키워드와 관련된 업무를 찾을 수 없습니다.
                다음과 같이 응답해주세요:
                {
                "message": "관련 업무를 찾을 수 없습니다.",
                "requires_confirmation": false,
                "proposed_actions": []
                }
                `;

                    const response = await janAI.sendPrompt("검색 결과 정리: " + originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 업무 추가 명령어 처리
                const handleAddCommand = async (originalPrompt, details) => {
                    // 컬럼 정보만 제공하여 컨텍스트 간소화
                    const columns = appData.columns.map(c => ({
                        id: c.id,
                        title: c.title
                    }));

                    const systemMessage = `
                다음은 현재 사용 가능한 컬럼(보드) 목록입니다:
                ${JSON.stringify(columns)}

                사용자 요청: "${originalPrompt}"

                사용자가 새 업무를 추가하려고 합니다. 어느 컬럼에 어떤 내용의 업무를 추가해야 할지 분석해주세요.
                필수 정보: 업무명(title), 컬럼ID(columnId)
                선택 정보: 설명(description), 마감일(dueDate), 중요도(priority: low/medium/high), 담당자(assignees), 태그(tags)

                다음 JSON 형식으로 응답해주세요:
                {
                "message": "새 업무 추가 관련 확인 메시지 (한국어)",
                "requires_confirmation": true,
                "proposed_actions": [
                    {
                    "type": "add",
                    "payload": {
                        "columnId": "컬럼ID",
                        "title": "업무명",
                        "description": "설명",
                        "dueDate": "YYYY-MM-DD",
                        "priority": "중요도",
                        "assignees": "담당자",
                        "tags": ["태그1", "태그2"]
                    }
                    }
                ]
                }

                모든 필드가 확실하지 않다면, 가능한 부분만 채워서 응답하세요.
                `;

                    const response = await janAI.sendPrompt("업무 추가 처리: " + originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 업무 수정 명령어 처리
                const handleUpdateCommand = async (originalPrompt, taskInfo) => {
                    // 수정 대상 업무 필터링
                    let relevantTasks = [];
                    if (taskInfo && taskInfo.title) {
                        relevantTasks = appData.tasks.filter(task =>
                            task.title.toLowerCase().includes(taskInfo.title.toLowerCase())
                        );
                    } else {
                        // 제목 정보가 없으면 최근 업무 몇 개만 표시
                        relevantTasks = appData.tasks.slice(-5);
                    }

                    const systemMessage = `
                다음은 수정할 가능성이 있는 업무 목록입니다:
                ${JSON.stringify(relevantTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    dueDate: t.dueDate,
                    priority: t.priority,
                    assignees: t.assignees,
                    columnId: t.columnId,
                    completed: t.completed
                })))}

                사용자 요청: "${originalPrompt}"

                수정할 업무와 변경할 내용을 파악해 다음 JSON 형식으로 응답해주세요:
                {
                "message": "업무 수정 확인 메시지 (한국어)",
                "requires_confirmation": true,
                "proposed_actions": [
                    {
                    "type": "update",
                    "payload": {
                        "taskId": "업무ID",
                        "updates": {
                        "title": "새 업무명",
                        "description": "새 설명",
                        "dueDate": "새 마감일",
                        "priority": "새 중요도",
                        "assignees": "새 담당자",
                        "completed": false/true,
                        "columnId": "새 컬럼ID",
                        "tags": ["새 태그1", "새 태그2"]
                        }
                    }
                    }
                ]
                }

                변경할 필드만 포함하고 나머지는 생략하세요.
                `;

                    const response = await janAI.sendPrompt("업무 수정 처리: " + originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 업무 삭제 명령어 처리
                const handleDeleteCommand = async (originalPrompt, taskInfo) => {
                    // 삭제 대상 업무 필터링
                    let relevantTasks = [];
                    if (taskInfo && taskInfo.title) {
                        relevantTasks = appData.tasks.filter(task =>
                            task.title.toLowerCase().includes(taskInfo.title.toLowerCase())
                        );
                    } else {
                        // 제목 정보가 없으면 최근 업무 몇 개만 표시
                        relevantTasks = appData.tasks.slice(-5);
                    }

                    const systemMessage = `
                다음은 삭제할 가능성이 있는 업무 목록입니다:
                ${JSON.stringify(relevantTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    dueDate: t.dueDate,
                    priority: t.priority,
                    assignees: t.assignees
                })))}

                사용자 요청: "${originalPrompt}"

                삭제할 업무를 파악해 다음 JSON 형식으로 응답해주세요:
                {
                "message": "업무 삭제 확인 메시지 (한국어)",
                "requires_confirmation": true,
                "proposed_actions": [
                    {
                    "type": "delete",
                    "payload": {
                        "taskId": "업무ID"
                    }
                    }
                ]
                }

                업무를 여러개 삭제해야 하는 경우 여러 delete 액션을 포함하세요.
                업무를 찾을 수 없으면 "message"에 그 내용을 포함하고 "proposed_actions"는 빈 배열로 설정하세요.
                `;

                    const response = await janAI.sendPrompt("업무 삭제 처리: " + originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 업무 이동 명령어 처리
                const handleMoveCommand = async (originalPrompt, taskInfo) => {
                    // 이동 대상 업무 필터링
                    let relevantTasks = [];
                    if (taskInfo && taskInfo.title) {
                        relevantTasks = appData.tasks.filter(task =>
                            task.title.toLowerCase().includes(taskInfo.title.toLowerCase())
                        );
                    } else {
                        // 제목 정보가 없으면 최근 업무 몇 개만 표시
                        relevantTasks = appData.tasks.slice(-5);
                    }

                    // 컬럼 정보 제공
                    const columns = appData.columns.map(c => ({
                        id: c.id,
                        title: c.title
                    }));

                    const systemMessage = `
                다음은 이동할 가능성이 있는 업무 목록입니다:
                ${JSON.stringify(relevantTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    columnId: t.columnId
                })))}

                가능한 대상 컬럼 목록:
                ${JSON.stringify(columns)}

                사용자 요청: "${originalPrompt}"

                이동할 업무와 대상 컬럼을 파악해 다음 JSON 형식으로 응답해주세요:
                {
                "message": "업무 이동 확인 메시지 (한국어)",
                "requires_confirmation": true,
                "proposed_actions": [
                    {
                    "type": "move",
                    "payload": {
                        "taskId": "업무ID",
                        "targetColumnId": "대상컬럼ID"
                    }
                    }
                ]
                }

                업무나 대상 컬럼을 찾을 수 없으면 "message"에 그 내용을 포함하고 "proposed_actions"는 빈 배열로 설정하세요.
                `;

                    const response = await janAI.sendPrompt("업무 이동 처리: " + originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 업무 정리 명령어 처리
                const handleOrganizeCommand = async (originalPrompt) => {
                    // 정리 대상 업무와 컬럼 정보 제공
                    const columns = appData.columns.map(c => ({
                        id: c.id,
                        title: c.title
                    }));

                    // 명령어에 따라 전체 또는 일부 업무만 제공
                    let tasksToOrganize = appData.tasks;
                    if (originalPrompt.toLowerCase().includes("마감")) {
                        // 마감일 관련 명령이면 마감일이 있는 업무만 필터링
                        tasksToOrganize = appData.tasks.filter(t => t.dueDate);
                    } else if (originalPrompt.toLowerCase().includes("우선순위") ||
                            originalPrompt.toLowerCase().includes("중요도")) {
                        // 우선순위 관련 명령이면 우선순위 정보가 있는 업무만
                        tasksToOrganize = appData.tasks.filter(t => t.priority);
                    }

                    const systemMessage = `
                사용자 요청: "${originalPrompt}"

                다음은 현재 컬럼 목록입니다:
                ${JSON.stringify(columns)}

                다음은 정리할 업무 목록입니다:
                ${JSON.stringify(tasksToOrganize.map(t => ({
                    id: t.id,
                    title: t.title,
                    dueDate: t.dueDate,
                    priority: t.priority,
                    assignees: t.assignees,
                    columnId: t.columnId,
                    completed: t.completed
                })))}

                사용자의 요청에 따라 업무를 정리해주세요. 업무 정리는 다음 작업을 포함할 수 있습니다:
                1. 업무 이동 (move)
                2. 업무 업데이트 (update)
                3. 업무 삭제 (delete)

                필요한 작업들을 파악해 다음 JSON 형식으로 응답해주세요:
                {
                "message": "업무 정리 제안 설명 (한국어)",
                "requires_confirmation": true,
                "proposed_actions": [
                    // 필요한 작업들...
                ]
                }

                액션은 최대 5개까지만 제안하세요.
                `;

                    const response = await janAI.sendPrompt("업무 정리: " + originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 일반적인 명령어 처리 (유형 분류 실패 시)
                const handleGenericCommand = async (originalPrompt) => {
                    // 작은 모델에게 부담되지 않도록 최소한의 정보만 제공
                    const basicInfo = {
                        taskCount: appData.tasks.length,
                        columnCount: appData.columns.length,
                        columnNames: appData.columns.map(c => c.title)
                    };

                    const systemMessage = `
                현재 업무 관리 앱 정보:
                - 총 업무 수: ${basicInfo.taskCount}개
                - 컬럼 수: ${basicInfo.columnCount}개
                - 컬럼 이름: ${basicInfo.columnNames.join(', ')}

                사용자 요청: "${originalPrompt}"

                사용자의 요청을 이해하고 응답해주세요. 작업이 필요하면 다음 JSON 형식으로 응답하고,
                단순 질문이면 간단한 정보 응답을 JSON 형식으로 제공해주세요:

                {
                "message": "사용자 요청에 대한 응답 (한국어)",
                "requires_confirmation": false/true,
                "proposed_actions": [] // 필요시 작업 제안
                }

                작업이 필요 없는 단순 응답:
                {
                "message": "요청에 대한 답변 (한국어)",
                "requires_confirmation": false,
                "proposed_actions": []
                }
                `;

                    const response = await janAI.sendPrompt(originalPrompt, systemMessage);
                    processAIResponse(response);
                };

                // 마감일 관련 명령어 처리
                    const handleDateCommand = async (originalPrompt, dateInfo) => {
                        // 현재 날짜 기준으로 날짜 필터링 조건 생성
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        // 마감일 조건에 따른 업무 필터링
                        let filteredTasks = [];
                        let conditionDescription = "";

                        switch (dateInfo?.condition) {
                            case 'overdue':
                                filteredTasks = appData.tasks.filter(task => {
                                    if (!task.dueDate) return false;
                                    return new Date(task.dueDate) < today;
                                });
                                conditionDescription = "마감일이 지난";
                                break;

                            case 'today':
                                filteredTasks = appData.tasks.filter(task => {
                                    if (!task.dueDate) return false;
                                    const taskDate = new Date(task.dueDate);
                                    return taskDate.getFullYear() === today.getFullYear() &&
                                        taskDate.getMonth() === today.getMonth() &&
                                        taskDate.getDate() === today.getDate();
                                });
                                conditionDescription = "오늘 마감인";
                                break;

                            case 'tomorrow':
                                const tomorrow = new Date(today);
                                tomorrow.setDate(today.getDate() + 1);
                                filteredTasks = appData.tasks.filter(task => {
                                    if (!task.dueDate) return false;
                                    const taskDate = new Date(task.dueDate);
                                    return taskDate.getFullYear() === tomorrow.getFullYear() &&
                                        taskDate.getMonth() === tomorrow.getMonth() &&
                                        taskDate.getDate() === tomorrow.getDate();
                                });
                                conditionDescription = "내일 마감인";
                                break;

                            case 'thisWeek':
                                const weekEnd = new Date(today);
                                weekEnd.setDate(today.getDate() + (6 - today.getDay())); // 이번 주 일요일
                                filteredTasks = appData.tasks.filter(task => {
                                    if (!task.dueDate) return false;
                                    const taskDate = new Date(task.dueDate);
                                    return taskDate >= today && taskDate <= weekEnd;
                                });
                                conditionDescription = "이번 주 마감인";
                                break;

                            default:
                                // 기본: 마감일 있는 모든 업무
                                filteredTasks = appData.tasks.filter(task => task.dueDate);
                                conditionDescription = "마감일이 있는";
                                break;
                        }

                        // 작업 유형에 따른 처리
                        const actionType = dateInfo?.action || 'search';

                        if (actionType === 'search') {
                            // 검색 결과 반환
                            const response = {
                                message: `${conditionDescription} 업무 ${filteredTasks.length}개를 찾았습니다.`,
                                requires_confirmation: false,
                                proposed_actions: [
                                    {
                                        type: "info",
                                        payload: {
                                            details: filteredTasks.map(t => ({
                                                id: t.id,
                                                title: t.title,
                                                dueDate: t.dueDate,
                                                priority: t.priority,
                                                columnId: t.columnId,
                                                assignees: t.assignees
                                            }))
                                        }
                                    }
                                ]
                            };

                            handleAIResponse(response);
                        } else if (actionType === 'tag') {
                            // 태그 추가 제안
                            const tagName = originalPrompt.match(/[''"]([^''"]+)[''"]/) ?
                                            originalPrompt.match(/[''"]([^''"]+)[''"]/) :
                                            originalPrompt.includes('태그') ?
                                            originalPrompt.split('태그')[1].trim().split(' ')[0] :
                                            '마감임박';

                            const actions = filteredTasks.map(task => ({
                                type: "update",
                                payload: {
                                    taskId: task.id,
                                    updates: {
                                        tags: [...(task.tags || []), tagName]
                                    }
                                }
                            }));

                            if (actions.length > 0) {
                                const response = {
                                    message: `${conditionDescription} 업무 ${filteredTasks.length}개에 '${tagName}' 태그를 추가하시겠습니까?`,
                                    requires_confirmation: true,
                                    proposed_actions: actions
                                };

                                handleAIResponse(response);
                            } else {
                                handleAIResponse({
                                    message: `${conditionDescription} 업무가 없습니다.`,
                                    requires_confirmation: false,
                                    proposed_actions: []
                                });
                            }
                        }
                    };


                // AI 응답 처리 - 공통 함수
                const processAIResponse = (response) => {
                    const aiContent = response?.choices?.[0]?.message?.content;

                    if (!aiContent) {
                        aiResponse.innerHTML = "<div class='ai-error'>AI로부터 유효한 응답을 받지 못했습니다.</div>";
                        return;
                    }

                    // JSON 부분 추출
                    const jsonMatch = aiContent.match(/{[\s\S]*}/);
                    if (jsonMatch) {
                        try {
                            const parsedResponse = JSON.parse(jsonMatch[0]);
                            handleAIResponse(parsedResponse);
                        } catch (parseError) {
                            console.error("AI 응답 JSON 파싱 오류:", parseError);

                            // 파싱 실패시 텍스트 그대로 표시
                            aiResponse.innerHTML = `
                                <div class='ai-error'>응답 형식에 문제가 있습니다. 원본 응답:</div>
                                <div class='ai-response-text'>${utils.escapeHtml(aiContent)}</div>
                            `;
                        }
                    } else {
                        // JSON이 아닌 텍스트 응답 처리
                        aiResponse.innerHTML = `<div class='ai-response-text'>${utils.escapeHtml(aiContent)}</div>`;
                    }
                };

                // AI 응답 처리 및 UI 업데이트
                let storedProposedActions = []; // 확인 대기 중인 작업을 임시 저장

                const handleAIResponse = (response) => {
                    aiResponse.innerHTML = ''; // 이전 응답 지우기
                    storedProposedActions = []; // 이전 액션 제안 초기화

                    const message = response?.message || "AI로부터 메시지를 받지 못했습니다.";
                    const requiresConfirmation = response?.requires_confirmation === true; // 명시적으로 true인지 확인
                    const proposedActions = response?.proposed_actions || [];

                    // 메시지 표시
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'ai-response-text';
                    messageDiv.textContent = message; // textContent로 안전하게 표시
                    aiResponse.appendChild(messageDiv);

                    // 'info' 타입 액션 처리 (정보성 메시지 추가 표시)
                    const infoAction = proposedActions.find(a => a.type === 'info');
                    if (infoAction && infoAction.payload?.details) {
                        const detailsDiv = document.createElement('div');
                        detailsDiv.style.marginTop = '10px';
                        detailsDiv.style.fontSize = '0.9em';
                        detailsDiv.style.opacity = '0.8';

                        if (Array.isArray(infoAction.payload.details)) {
                            detailsDiv.innerHTML = '<strong>관련 업무:</strong><ul>' +
                                infoAction.payload.details.map(taskInfo =>
                                    `<li>${utils.escapeHtml(taskInfo.title || '제목 없음')} ${
                                        taskInfo.dueDate ? `(마감일: ${taskInfo.dueDate})` : ''
                                    } ${
                                        taskInfo.priority ? `(중요도: ${taskInfo.priority})` : ''
                                    }</li>`
                                ).join('') + '</ul>';
                        } else if (typeof infoAction.payload.details === 'string') {
                            detailsDiv.innerHTML = `<strong>정보:</strong> ${utils.escapeHtml(infoAction.payload.details)}`;
                        }
                        aiResponse.appendChild(detailsDiv);
                    }

                    if (requiresConfirmation && proposedActions.length > 0) {
                        // 확인/취소 버튼 추가
                        storedProposedActions = proposedActions; // 실행할 액션 저장

                        const confirmationDiv = document.createElement('div');
                        confirmationDiv.style.marginTop = '15px';
                        confirmationDiv.style.display = 'flex';
                        confirmationDiv.style.gap = '10px';

                        const confirmButton = document.createElement('button');
                        confirmButton.textContent = '확인 (실행)';
                        confirmButton.className = 'ai-btn ai-btn--confirm';
                        confirmButton.onclick = () => {
                            aiResponse.innerHTML = "<div class='ai-thinking'>⏳ 작업을 처리 중입니다...</div>";
                            // 저장된 액션 실행
                            executeProposedAIActions(storedProposedActions);
                            storedProposedActions = []; // 실행 후 초기화
                        };

                        const cancelButton = document.createElement('button');
                        cancelButton.textContent = '취소';
                        cancelButton.className = 'ai-btn ai-btn--cancel ai-btn--secondary';
                        cancelButton.onclick = () => {
                            aiResponse.innerHTML = "<div class='ai-info'>ℹ️ 작업이 취소되었습니다.</div>";
                            storedProposedActions = []; // 취소 시 초기화
                        };

                        confirmationDiv.appendChild(confirmButton);
                        confirmationDiv.appendChild(cancelButton);
                        aiResponse.appendChild(confirmationDiv);
                    } else if (!requiresConfirmation && proposedActions.length === 0 && !infoAction) {
                        // 작업 없음 & 정보 없음 메시지 강조
                        messageDiv.style.fontStyle = 'italic';
                    }
                };

                // 제안된 AI 액션 실행
                const executeProposedAIActions = (actions) => {
                    let performedActions = false;
                    let actionResults = []; // 각 액션의 성공/실패 메시지

                    try {
                        actions.forEach(action => {
                            const { type, payload } = action;
                            let resultMessage = '';

                            try {
                                switch (type) {
                                    case 'add':
                                        if (payload.columnId && payload.title) {
                                            addTask({
                                                columnId: payload.columnId,
                                                title: payload.title,
                                                description: payload.description,
                                                dueDate: payload.dueDate,
                                                priority: payload.priority || 'medium',
                                                assignees: payload.assignees,
                                                tags: payload.tags || []
                                            });
                                            resultMessage = `✅ '${payload.title}' 업무 추가 완료.`;
                                            performedActions = true;
                                        } else {
                                            throw new Error("추가 액션에 필요한 정보가 부족합니다.");
                                        }
                                        break;

                                    case 'update':
                                        if (payload.taskId && payload.updates) {
                                            const taskIndex = appData.tasks.findIndex(t => t.id === payload.taskId);
                                            if (taskIndex > -1) {
                                                const task = appData.tasks[taskIndex];
                                                updateTask(payload.taskId, { ...task, ...payload.updates });
                                                resultMessage = `✅ '${task.title}' 업무 수정 완료.`;
                                                performedActions = true;
                                            } else {
                                                throw new Error(`ID '${payload.taskId}'의 업무를 찾을 수 없습니다.`);
                                            }
                                        } else {
                                            throw new Error("수정 액션에 필요한 정보가 부족합니다.");
                                        }
                                        break;

                                    case 'delete':
                                        if (payload.taskId) {
                                            const task = appData.tasks.find(t => t.id === payload.taskId);
                                            if (task) {
                                                const taskTitle = task.title; // 삭제 전 제목 저장
                                                deleteTask(payload.taskId);
                                                resultMessage = `✅ '${taskTitle}' 업무 삭제 완료.`;
                                                performedActions = true;
                                            } else {
                                                throw new Error(`ID '${payload.taskId}'의 업무를 찾을 수 없습니다.`);
                                            }
                                        } else {
                                            throw new Error("삭제 액션에 필요한 정보가 부족합니다.");
                                        }
                                        break;

                                    case 'move':
                                        if (payload.taskId && payload.targetColumnId) {
                                            const task = appData.tasks.find(t => t.id === payload.taskId);
                                            const column = appData.columns.find(c => c.id === payload.targetColumnId);

                                            if (task && column) {
                                                moveTask(payload.taskId, payload.targetColumnId);
                                                resultMessage = `✅ '${task.title}' 업무를 '${column.title}' 컬럼으로 이동 완료.`;
                                                performedActions = true;
                                            } else {
                                                throw new Error("이동할 업무 또는 대상 컬럼을 찾을 수 없습니다.");
                                            }
                                        } else {
                                            throw new Error("이동 액션에 필요한 정보가 부족합니다.");
                                        }
                                        break;

                                    case 'info':
                                        // 정보 액션은 별도 처리 필요 없음
                                        resultMessage = `ℹ️ 정보 조회 완료.`;
                                        break;

                                    default:
                                        console.warn("알 수 없는 AI 액션 타입:", type);
                                        resultMessage = `⚠️ 알 수 없는 액션 타입 '${type}'`;
                                }

                                actionResults.push(resultMessage);
                            } catch (actionError) {
                                console.error(`Error executing AI action ${type}:`, actionError);
                                actionResults.push(`❌ ${type} 액션 처리 중 오류: ${actionError.message}`);
                            }
                        });

                        if (performedActions) {
                            saveData(); // 모든 액션 처리 후 한 번만 저장
                            renderBoard(); // UI 업데이트

                            // 성공 메시지 표시
                            aiResponse.innerHTML = `<div class='ai-success'>${actionResults.filter(r => r.startsWith('✅') || r.startsWith('ℹ️')).join('<br>')}</div>`;

                            if(actionResults.some(r => r.startsWith('❌') || r.startsWith('⚠️'))) {
                                aiResponse.innerHTML += `<div class='ai-error' style='margin-top: 10px;'><strong>일부 작업 실패:</strong><br>${actionResults.filter(r => r.startsWith('❌') || r.startsWith('⚠️')).join('<br>')}</div>`;
                            }
                        } else {
                            // 실행된 작업이 없을 때
                            if (actionResults.some(r => r.startsWith('❌') || r.startsWith('⚠️'))) {
                                aiResponse.innerHTML = `<div class='ai-error'><strong>작업 실패:</strong><br>${actionResults.filter(r => r.startsWith('❌') || r.startsWith('⚠️')).join('<br>')}</div>`;
                            } else {
                                aiResponse.innerHTML = `<div class='ai-info'>ℹ️ 요청하신 작업이 완료되었습니다 (데이터 변경 없음).</div>`;
                            }
                        }
                    } catch (globalError) {
                        console.error("Error during AI action execution:", globalError);
                        aiResponse.innerHTML = `<div class='ai-error'>⚠️ AI 액션 실행 중 예외 발생: ${utils.escapeHtml(globalError.message)}</div>`;
                    }
                };

                // AI로 업무 정리 기능
                /*const organizeTasksWithAI = async () => {
                    // --- AI 프롬프트 예시 수정: 작은 모델에서 더 잘 이해할 수 있도록 명확화 ---
                    const organizePrompt = `
                    업무 정리 요청:
                    1. 마감일(dueDate)이 오늘 날짜보다 이전인 모든 업무를 찾아서 중요도(priority)를 'high'로 변경해주세요.
                    2. 마감일(dueDate)이 오늘 날짜와 같은 모든 업무를 찾아서 '오늘마감' 태그(tags)를 추가해주세요. (기존 태그 유지)
                    3. 완료된(completed: true) 업무가 있다면 알려주세요. (정렬은 사용자가 직접 하도록 유도)
                    `;
                    await processAICommand(organizePrompt);
                };*/
            // --- Modal Handling ---
            // Store reference to the element that was focused before opening the modal
            let elementFocusedBeforeModal;

            const openTaskModal = (mode = 'add', columnId = null, taskId = null) => {
                elementFocusedBeforeModal = document.activeElement; // Store focus

                taskForm.reset();
                tagsContainer.innerHTML = '';
                currentTags = [];
                taskModal.setAttribute('aria-hidden', 'false'); // Make modal accessible

                const today = new Date().toISOString().split('T')[0];
                taskForm.taskDueDate.value = today; // Default due date
                taskForm.taskPriority.value = 'medium'; // Default priority

                if (mode === 'edit' && taskId) {
                    const task = getTaskDataById(taskId);
                    if (task) {
                        modalTitle.textContent = '업무 수정';
                        taskForm.taskId.value = task.id;
                        taskForm.columnId.value = task.columnId;
                        taskForm.taskTitle.value = task.title;
                        taskForm.taskDescription.value = task.description || '';
                        taskForm.taskDueDate.value = task.dueDate || ''; // Allow empty date
                        taskForm.taskAssignees.value = task.assignees || '';
                        taskForm.taskPriority.value = task.priority || 'medium';
                        if (task.tags && task.tags.length > 0) {
                            currentTags = [...task.tags];
                            renderTags();
                        }
                    } else {
                        console.error("업무 수정 오류: ID를 찾을 수 없음", taskId);
                        utils.showFeedback("수정하려는 업무를 찾을 수 없습니다.", 'error');
                        taskModal.setAttribute('aria-hidden', 'true'); // Hide if error
                        return; // Don't open modal
                    }
                } else {
                    const columnName = getColumnTitleElement(columnId)?.textContent || '새';
                    modalTitle.textContent = `${columnName} 업무 추가`;
                    taskForm.taskId.value = '';
                    taskForm.columnId.value = columnId;
                     taskForm.taskDueDate.value = ''; // Start with empty date for new tasks
                }

                taskModal.classList.add('visible');
                requestAnimationFrame(() => { // Wait for display:flex to apply
                    taskModal.classList.add('modal--visible');
                    taskForm.taskTitle.focus(); // Set focus to the first input
                     // Basic focus trap concept (needs more robust implementation for production)
                     // Add keydown listener to modal content to trap focus
                });
            };

            const closeModal = () => {
                // 1. 포커스 되돌리기 (가장 먼저 수행)
                if (elementFocusedBeforeModal) {
                    elementFocusedBeforeModal.focus();
                }

                taskModal.classList.remove('modal--visible');

                // 2. aria-hidden 설정 (포커스 이동 후)
                 taskModal.setAttribute('aria-hidden', 'true');

                 // Wait for transition to finish before removing 'visible' (display: none)
                  // The timeout should match the CSS transition duration
                 setTimeout(() => {
                     taskModal.classList.remove('visible');
                 }, 300); // Match CSS transition duration
             };


            const openDetailModal = (taskId) => {
                elementFocusedBeforeModal = document.activeElement;
                const task = getTaskDataById(taskId);
                if (!task) {
                    console.error("업무 상세 보기 오류: ID를 찾을 수 없음", taskId);
                    utils.showFeedback("표시하려는 업무를 찾을 수 없습니다.", 'error');
                    return;
                }

                // 중요도에 따른 클래스 결정 함수
                const getPriorityClass = (priority) => {
                    switch (priority?.toLowerCase()) {
                        case 'high': return 'priority-high';
                        case 'medium': return 'priority-medium';
                        case 'low': return 'priority-low';
                        default: return 'priority-default'; // 기본값 처리
                    }
                };

                // 상태에 따른 클래스 결정 함수
                const getStatusClass = (completed) => {
                    return completed ? 'status-completed' : 'status-inprogress';
                };

                detailContent.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                        <h3 id="taskDetailTitle" style="margin: 0; font-size: 1.4em; word-break: break-word;">${utils.escapeHtml(task.title)}</h3>
                        ${task.creatorName ?
                            `<div style="padding: 4px 8px; background-color: var(--accent-color-light); border-radius: 4px; font-size: 0.9em; text-align: right; margin-left: 10px; white-space: nowrap;">
                                <strong>작성자:</strong>${utils.escapeHtml(task.creatorName)}
                             </div>` : ''}
                    </div>

                    <div class="task-detail-grid">
                        <div class="task-detail-label">상태</div>
                        <div class="task-detail-value">
                            <span class="status-badge ${getStatusClass(task.completed)}">${task.completed ? '완료' : '진행중'}</span>
                        </div>

                        <div class="task-detail-label">중요도</div>
                        <div class="task-detail-value">
                            <span class="priority-badge ${getPriorityClass(task.priority)}">${task.priority || '보통'}</span>
                        </div>

                        <div class="task-detail-label">마감일</div>
                        <div class="task-detail-value">${utils.formatDueDateForDisplay(task.dueDate) || '미지정'} ${task.dueDate ? `(${task.dueDate})` : ''}</div>

                        <div class="task-detail-label">담당자</div>
                        <div class="task-detail-value">${utils.escapeHtml(task.assignees || '미지정')}</div>

                        ${task.tags && task.tags.length > 0 ? `
                            <div class="task-detail-label">태그</div>
                            <div class="task-detail-value">${task.tags.map(t => `<span class="task__tag">${utils.escapeHtml(t)}</span>`).join(' ')}</div>
                        ` : ''}
                    </div>

                    <div class="task-detail-description">
                        <p>설명:</p>
                        <p>${utils.escapeHtml(task.description || '없음')}</p>
                    </div>
                `;

                // inert 속성 제거 및 aria-hidden 설정 업데이트
                detailModal.removeAttribute('inert');
                detailModal.setAttribute('aria-hidden', 'false');

                detailModal.classList.add('visible');
                requestAnimationFrame(() => {
                    detailModal.classList.add('modal--visible');
                    detailModal.querySelector('.modal__close').focus(); // Focus close button
                });
            };

            const closeDetailModal = () => {
                detailModal.classList.remove('modal--visible');

                // 모달이 사라지기 전에 포커스를 먼저 이동
                if (elementFocusedBeforeModal) {
                    elementFocusedBeforeModal.focus();
                }

                // aria-hidden 설정 및 inert 속성 추가
                detailModal.setAttribute('aria-hidden', 'true');
                detailModal.setAttribute('inert', '');

                setTimeout(() => {
                    detailModal.classList.remove('visible');
                    detailModal.removeAttribute('inert'); // 애니메이션 완료 후 inert 제거
                }, 300);
            };

            // --- Tag Management ---
            const addTag = (tagText) => {
                const tag = tagText.trim();
                if (tag && !currentTags.includes(tag)) {
                    if (currentTags.length >= 10) { // Limit tags?
                        utils.showFeedback("태그는 최대 10개까지 추가할 수 있습니다.", 'warning');
                        return;
                    }
                    currentTags.push(tag);
                    renderTags();
                }
                tagInput.value = ''; // Clear input after adding
            };

            const removeTag = (tagIndex) => {
                if (tagIndex >= 0 && tagIndex < currentTags.length) {
                     const removedTag = currentTags.splice(tagIndex, 1)[0];
                     renderTags();
                     // utils.showFeedback(`'${removedTag}' 태그 삭제됨.`); // Maybe too noisy
                }
            };

            const renderTags = () => {
                tagsContainer.innerHTML = '';
                if (currentTags.length === 0) {
                    // Optional: Show placeholder text when no tags
                    // tagsContainer.innerHTML = '<p style="font-style: italic; color: var(--text-secondary-color);">태그가 없습니다.</p>';
                    return;
                }
                currentTags.forEach((tag, index) => {
                    const tagEl = document.createElement('span');
                    tagEl.className = 'form-group__tag';
                    tagEl.textContent = tag; // Set text content directly

                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button'; // Prevent form submission
                    removeBtn.className = 'form-group__tag-remove';
                    removeBtn.innerHTML = '×';
                    removeBtn.dataset.tagIndex = index;
                    removeBtn.setAttribute('aria-label', `${tag} 태그 삭제`);
                    removeBtn.addEventListener('click', () => removeTag(index)); // Add listener here

                    tagEl.appendChild(removeBtn);
                    tagsContainer.appendChild(tagEl);
                });
            };

            // --- Drag and Drop ---
            const handleDragStart = (e) => {
                // Check if dragging is initiated from a valid handle or the task itself
                // For example, prevent drag start if clicking on input/button inside task
                if (e.target.closest('input, button, textarea, select')) {
                    e.preventDefault();
                    return;
                }
                draggedTask = e.target;
                setTimeout(() => draggedTask.classList.add('task--dragging'), 0);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedTask.dataset.taskId); // Required for Firefox
            };

            const handleDragEnd = () => {
                if (draggedTask) {
                    draggedTask.classList.remove('task--dragging');
                }
                removePlaceholder(); // Ensure placeholder is removed
                board.querySelectorAll('.column__content--drag-over').forEach(col => {
                    col.classList.remove('column__content--drag-over');
                });
                draggedTask = null;
            };

            const handleDragOver = (e) => {
                e.preventDefault(); // Necessary to allow drop
                if (!draggedTask) return;
                e.dataTransfer.dropEffect = 'move';

                const columnContent = e.target.closest('.column__content');
                if (!columnContent) return;

                columnContent.classList.add('column__content--drag-over'); // Highlight column

                const afterElement = getDragAfterElement(columnContent, e.clientY);
                updatePlaceholder(columnContent, afterElement);
            };

            const handleDragLeave = (e) => {
                const columnContent = e.target.closest('.column__content');
                // Check if the mouse is truly leaving the column content area
                if (columnContent && !columnContent.contains(e.relatedTarget)) {
                    columnContent.classList.remove('column__content--drag-over');
                    removePlaceholder();
                }
            };

            const handleDrop = (e) => {
                e.preventDefault();
                if (!draggedTask) return;

                const taskId = draggedTask.dataset.taskId;
                // 대상 컬럼 ID 획득
                let targetColumnId;
                if (e.currentTarget.dataset.columnId) {
                    // 메인 대시보드 컬럼의 경우 dataset.columnId 속성 사용
                    targetColumnId = e.currentTarget.dataset.columnId;
                } else {
                    // PGM 하위 컬럼의 경우 ID에서 추출 (예: "AVI-red-content" -> "AVI-red")
                    const contentElId = e.currentTarget.id;
                    if (contentElId && contentElId.endsWith('-content')) {
                        targetColumnId = contentElId.replace('-content', '');
                    }
                }

                if (!targetColumnId) {
                    console.error("Drop target column ID could not be determined");
                    return;
                }

                // 다른 컬럼으로 이동시키는 함수 호출
                moveTask(taskId, targetColumnId);

                // 드래그 오버 클래스 제거
                e.currentTarget.classList.remove('column__content--drag-over');
            };

            const getDragAfterElement = (container, y) => {
                const draggableElements = [...container.querySelectorAll('.task:not(.task--dragging):not(.task--placeholder)')];
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            };

            // Placeholder functions
            const createPlaceholder = () => {
                if (!dragPlaceholder) {
                    dragPlaceholder = document.createElement('div');
                    dragPlaceholder.className = 'task task--placeholder';
                    // Match height roughly to the dragged task?
                    if (draggedTask) {
                         dragPlaceholder.style.height = `${draggedTask.offsetHeight}px`;
                    }
                }
                return dragPlaceholder;
            };

            const removePlaceholder = () => {
                if (dragPlaceholder && dragPlaceholder.parentNode) {
                    dragPlaceholder.parentNode.removeChild(dragPlaceholder);
                }
                // dragPlaceholder = null; // Don't nullify, reuse the element
            };

            const updatePlaceholder = (container, afterElement) => {
                removePlaceholder(); // Remove from previous position first
                const placeholder = createPlaceholder();
                if (afterElement) {
                    container.insertBefore(placeholder, afterElement);
                } else {
                    container.appendChild(placeholder); // Append if no element after
                }
            };


            // --- Context Menu ---
            const showColumnMenu = (buttonElement, columnId) => {
                closeColumnMenu(); // 기존 메뉴 닫기

                currentMenu = document.createElement('div');
                currentMenu.className = 'menu';
                currentMenu.setAttribute('role', 'menu');

                const createMenuItem = (text, action, ariaLabel) => {
                    const item = document.createElement('div');
                    item.className = 'menu__item';
                    item.textContent = text;
                    item.setAttribute('role', 'menuitem');
                    item.tabIndex = -1; // Make focusable by script if needed
                    item.onclick = () => {
                        action();
                        closeColumnMenu();
                    };
                    if (ariaLabel) item.setAttribute('aria-label', ariaLabel);
                    return item;
                };

                // 정렬 옵션 추가
                currentMenu.appendChild(createMenuItem('날짜 오름차순 정렬', () => sortAndRenderColumn(columnId, 'date', 'asc')));
                currentMenu.appendChild(createMenuItem('날짜 내림차순 정렬', () => sortAndRenderColumn(columnId, 'date', 'desc')));
                currentMenu.appendChild(createMenuItem('중요도 높은순 정렬', () => sortAndRenderColumn(columnId, 'priority', 'desc')));
                currentMenu.appendChild(createMenuItem('중요도 낮은순 정렬', () => sortAndRenderColumn(columnId, 'priority', 'asc')));

                const separator = document.createElement('div');
                separator.className = 'menu__separator';
                separator.setAttribute('role', 'separator');
                currentMenu.appendChild(separator);

                currentMenu.appendChild(createMenuItem('텍스트 파일로 내보내기', () => exportColumnToText(columnId)));

                document.body.appendChild(currentMenu);

                // Positioning
                const btnRect = buttonElement.getBoundingClientRect();
                const menuRect = currentMenu.getBoundingClientRect();
                let top = btnRect.bottom + window.scrollY + 2;
                let left = btnRect.left + window.scrollX;

                // Adjust if menu goes off-screen
                if (left + menuRect.width > window.innerWidth) {
                    left = window.innerWidth - menuRect.width - 10;
                }
                if (top + menuRect.height > window.innerHeight) {
                    top = btnRect.top + window.scrollY - menuRect.height - 2;
                }

                // Apply positioning
                currentMenu.style.top = top + 'px';
                currentMenu.style.left = left + 'px';

                // Show with animation
                setTimeout(() => currentMenu.classList.add('menu--visible'), 10);

                // Add global event listeners to close on click outside or Escape key
                document.addEventListener('click', handleDocumentClick);
                document.addEventListener('keydown', handleDocumentKeydown);
            };

            // 정렬 및 렌더링 함수 추가
            const sortAndRenderColumn = (columnId, sortBy, direction) => {
                // 컬럼이 메인 보드 컬럼인지 PGM 서브컬럼인지 확인
                const isPgmSubColumn = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'].includes(columnId);

                // 해당 컬럼의 태스크 가져오기
                const tasks = appData.tasks.filter(task => task.columnId === columnId);

                // 정렬 로직
                const sortedTasks = [...tasks].sort((a, b) => {
                    if (sortBy === 'date') {
                        // 날짜 정렬 (없으면 맨 뒤로)
                        const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
                        const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
                        return direction === 'asc' ? dateA - dateB : dateB - dateA;
                    } else if (sortBy === 'priority') {
                        // 중요도 정렬 (high > medium > low)
                        const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
                        const weightA = priorityWeight[a.priority] || 0;
                        const weightB = priorityWeight[b.priority] || 0;
                        return direction === 'asc' ? weightA - weightB : weightB - weightA;
                    }
                    return 0;
                });

                // 정렬된 결과 화면에 적용
                if (isPgmSubColumn) {
                    // PGM 서브 컬럼인 경우
                    const contentEl = getPgmSubColumnContentElement(columnId);
                    if (contentEl) {
                        contentEl.innerHTML = ''; // 기존 내용 비우기
                        if (sortedTasks.length === 0) {
                            contentEl.appendChild(createEmptyState());
                        } else {
                            sortedTasks.forEach(task => {
                                try {
                                    const taskEl = createTaskElement(task);
                                    contentEl.appendChild(taskEl);
                                } catch (error) {
                                    console.error(`정렬 오류: ${error.message}`);
                                }
                            });
                        }
                    }
                } else {
                    // 메인 보드 컬럼인 경우
                    const contentEl = document.querySelector(`.column__content[data-column-id="${columnId}"]`);
                    if (contentEl) {
                        contentEl.innerHTML = ''; // 기존 내용 비우기
                        if (sortedTasks.length === 0) {
                            contentEl.appendChild(createEmptyState());
                        } else {
                            sortedTasks.forEach(task => {
                                try {
                                    const taskEl = createTaskElement(task);
                                    contentEl.appendChild(taskEl);
                                } catch (error) {
                                    console.error(`정렬 오류: ${error.message}`);
                                }
                            });
                        }
                    }
                }

                // 성공 메시지
                const sortTypeText = sortBy === 'date' ? '날짜' : '중요도';
                const directionText = direction === 'asc' ? '오름차순' : '내림차순';
                utils.showFeedback(`${sortTypeText} ${directionText}으로 정렬했습니다.`);
            };

            // PGM 서브컬럼 콘텐츠 요소 가져오기 헬퍼 함수
            const getPgmSubColumnContentElement = (subColumnId) => {
                return document.getElementById(`${subColumnId}-content`);
            };

            const closeColumnMenu = () => {
                if (currentMenu) {
                    currentMenu.classList.remove('menu--visible');
                    // 이벤트 리스너 제거
                    document.removeEventListener('click', handleDocumentClick);
                    document.removeEventListener('keydown', handleDocumentKeydown);
                    // DOM에서 제거 (트랜지션 끝난 후)
                    currentMenu.addEventListener('transitionend', () => {
                        currentMenu?.remove(); // 아직 존재하는지 확인
                        currentMenu = null;
                    }, { once: true });
                }
            };

            const handleDocumentClick = (event) => {
                if (currentMenu && !currentMenu.contains(event.target) && !event.target.closest('.action-btn--menu')) {
                    closeColumnMenu();
                }
            };

            const handleDocumentKeydown = (event) => {
                if (currentMenu && event.key === 'Escape') {
                    closeColumnMenu();
                }
            };

            // --- Export ---
            const exportColumnToText = (columnId) => {
                const tasksToExport = appData.tasks.filter(task => task.columnId === columnId)
                                            .sort((a, b) => (new Date(a.dueDate || '9999-12-31')) - (new Date(b.dueDate || '9999-12-31')));
                if (tasksToExport.length === 0) {
                    utils.showFeedback('내보낼 작업이 없습니다.');
                    return;
                }

                const columnTitle = getColumnTitleElement(columnId)?.textContent || columnId;
                let text = `== ${columnTitle} ==\nExported on: ${new Date().toLocaleString('ko-KR')}\n\n`;
                tasksToExport.forEach(task => {
                    text += `[${task.completed ? 'x' : ' '}] ${task.title}\n`;
                    text += `   - 중요도: ${task.priority || '보통'}\n`;
                    text += `   - 마감일: ${utils.formatDueDateForDisplay(task.dueDate)} (${task.dueDate || '미지정'})\n`;
                    text += `   - 담당자: ${task.assignees || '미지정'}\n`;
                    if (task.tags && task.tags.length > 0) {
                        text += `   - 태그: ${task.tags.join(', ')}\n`;
                    }
                    if (task.description) {
                        text += `   - 설명:\n     ${task.description.replace(/\n/g, '\n     ')}\n`; // Indent description lines
                    }
                    text += `\n`;
                });

                try {
                    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const filename = columnTitle.replace(/[^a-z0-9_\-가-힣]/gi, '_');
                    a.download = `${filename}_업무목록_${new Date().toISOString().split('T')[0]}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    utils.showFeedback(`${columnTitle} 목록을 파일로 내보냈습니다.`);
                } catch(e) {
                    console.error("파일 내보내기 오류:", e);
                    utils.showFeedback("파일 내보내기 중 오류 발생", "error");
                    // Fallback: show text in a new window/tab
                    const newWindow = window.open();
                    newWindow.document.write('<pre>' + utils.escapeHtml(text) + '</pre>');
                }
            };

            // --- Search/Filter ---
            const filterTasks = (searchTerm) => {
                const term = searchTerm.toLowerCase().trim();
                // 수정: 검색 대상을 메인 보드와 PGM 히스토리 모두 포함
                const allTasks = document.querySelectorAll('#board .task, #pgm-history-content .task');
                let visibleCount = 0;

                allTasks.forEach(taskEl => {
                    // Ignore placeholder during filtering
                    if (taskEl.classList.contains('task--placeholder')) return;

                    const taskId = taskEl.dataset.taskId;
                    const task = getTaskDataById(taskId);
                    let isVisible = false;

                    if (!task) {
                        isVisible = false; // Hide if task data not found
                    } else if (term === '') {
                        isVisible = true; // Show all if search is empty
                    } else {
                        // Search in title, description, assignees, tags
                        const searchableText = [
                            task.title,
                            task.description || '',
                            task.assignees || '',
                            (task.tags || []).join(' ')
                        ].join(' ').toLowerCase();
                        isVisible = searchableText.includes(term);
                    }

                    taskEl.style.display = isVisible ? '' : 'none';
                    if (isVisible) visibleCount++;
                });

                 // 메인 보드 컬럼 빈 상태 업데이트 로직 (기존 유지)
                 appData.columns.forEach(col => {
                     const contentEl = getColumnContentElement(col.id);
                     if (contentEl) {
                         // 수정: 플레이스홀더 제외하고 카운트
                         const visibleTasksInColumn = contentEl.querySelectorAll('.task:not(.task--placeholder):not([style*="display: none"])').length;
                         const emptyState = contentEl.querySelector('.empty-state');
                         if (visibleTasksInColumn === 0 && !emptyState && term !== '') { // Only show empty state during active search
                            const searchEmptyState = createEmptyState();
                            searchEmptyState.textContent = `'${term}' 검색 결과 없음`;
                            contentEl.appendChild(searchEmptyState);
                         } else if ((visibleTasksInColumn > 0 || term === '') && emptyState) {
                             emptyState.remove();
                         }
                         // Restore original empty state if search is cleared and column is truly empty
                         else if (term === '' && app.appData.tasks.filter(t=> t.columnId === col.id).length === 0 && !emptyState) {
                              contentEl.appendChild(createEmptyState());
                         }
                     }
                 });

                 // --- 추가: PGM 하위 컬럼 빈 상태 업데이트 로직 ---
                 const pgmSubColumns = ['apple-red', 'apple-yellow', 'pear-black', 'pear-pink'];
                 pgmSubColumns.forEach(subColumnId => {
                     const contentEl = getPgmSubColumnContentElement(subColumnId); // Use the global helper
                     if (contentEl) {
                         // 수정: 플레이스홀더 제외하고 카운트
                         const visibleTasksInSubColumn = contentEl.querySelectorAll('.task:not(.task--placeholder):not([style*="display: none"])').length;
                         const emptyState = contentEl.querySelector('.empty-state');
                         if (term !== '' && visibleTasksInSubColumn === 0 && !emptyState) {
                             // 검색 중이고 보이는 태스크가 없으면 '검색 결과 없음' 표시
                             const searchEmptyState = createEmptyState();
                             searchEmptyState.textContent = `'${term}' 검색 결과 없음`;
                             contentEl.appendChild(searchEmptyState);
                         } else if ((visibleTasksInSubColumn > 0 || term === '') && emptyState) {
                             // 보이는 태스크가 있거나 검색어가 비워지면 빈 상태 메시지 제거
                             emptyState.remove();
                         }
                         // Restore original empty state if search is cleared and sub-column is truly empty
                         else if (term === '' && app.appData.tasks.filter(t => t.columnId === subColumnId).length === 0 && !emptyState) {
                             // 검색어가 없고 실제로 데이터가 없으면 '업무가 없습니다' 표시
                             contentEl.appendChild(createEmptyState());
                         }
                     }
                 });
                 // -------------------------------------------
            };

            // filterTasks 함수 정의 바로 아래에 debouncedFilterTasks 선언 추가
            const debouncedFilterTasks = utils.debounce(filterTasks, 300);


            // --- Form Handling ---
            const handleFormSubmit = (event) => {
                event.preventDefault();
                const formData = new FormData(taskForm);
                const taskId = formData.get('taskId');
                const taskData = {
                    columnId: formData.get('columnId'),
                    title: formData.get('taskTitle').trim(),
                    description: formData.get('taskDescription').trim(),
                    dueDate: formData.get('taskDueDate') || null, // Store as null if empty
                    assignees: formData.get('taskAssignees').trim(),
                    priority: formData.get('taskPriority'),
                    tags: [...currentTags] // Get tags from the current modal state
                };

                if (!taskData.title) {
                    utils.showFeedback('업무명을 입력해주세요.', 'warning');
                    taskForm.taskTitle.focus();
                    return;
                }
                // Basic date validation (optional)
                if (taskData.dueDate && isNaN(new Date(taskData.dueDate).getTime())) {
                    utils.showFeedback('유효하지 않은 날짜 형식입니다.', 'warning');
                    taskForm.taskDueDate.focus();
                    return;
                }

                if (taskId) {
                    updateTask(taskId, taskData);
                } else {
                    addTask(taskData);
                     utils.showFeedback(`'${taskData.title}' 업무 추가됨.`);
                }

                closeModal();
            };

            // --- Event Delegation Handler ---
            const handleBoardClick = (event) => {
                const target = event.target;
                const menuButton = target.closest('.action-btn--menu');
                const columnEl = target.closest('.column'); // 컬럼 요소 찾기 (기존과 동일)

                // --- Column Actions ---
                if (columnEl) {
                    const columnId = columnEl.dataset.columnId;
                    // Add Task Button
                    if (target.matches('.action-btn--add')) {
                        openTaskModal('add', columnId);
                        return;
                    }
                    // Column Menu Button// menuButton을 찾았는지 확인
                    // showColumnMenu 호출 시 event 대신 menuButton (클릭된 버튼)을 전달
                    if (menuButton) {
                    showColumnMenu(menuButton, columnId); // <-- event 대신 menuButton 전달
                    return;
                    }
                    // Column Title (handled by dblclick listener on titleEl)
                }

                // --- Task Actions ---
                const taskEl = target.closest('.task');
                if (taskEl) {
                    const taskId = taskEl.dataset.taskId;
                    const actionTarget = target.closest('[data-action]');
                    const action = actionTarget?.dataset.action;

                    switch(action) {
                        case 'deleteTask':
                            const task = getTaskDataById(taskId);
                            if (task && confirm(`'${task.title}' 업무를 삭제하시겠습니까?`)) {
                                deleteTask(taskId);
                            }
                            break;
                        case 'toggleComplete':
                            // Ensure the click was directly on the checkbox itself
                            if (target.matches('.task__checkbox')) {
                                toggleComplete(taskId);
                            }
                            break;
                        case 'openDetail':
                             // Open detail modal when clicking title or general task area
                             if (!target.matches('.task__checkbox') && !target.matches('.task__delete-btn')) {
                                 openDetailModal(taskId);
                             }
                            break;
                         // Double-click to edit is handled by a separate listener on the task element itself
                    }
                    return; // Stop further processing if a task action was handled
                }

                // --- Tag Remove Button (in Modal) ---
                 // This needs to be handled differently as it's outside the board delegate
                 // We added direct listener in renderTags
            };


            // --- Keyboard Shortcuts ---
            const handleKeyDown = (event) => {
                // Ctrl+Enter / Cmd+Enter to submit form when modal is open
                 const isModalOpen = taskModal.classList.contains('visible');
                 const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                 const modKeyPressed = isMac ? event.metaKey : event.ctrlKey;

                if (isModalOpen && modKeyPressed && event.key === 'Enter') {
                     // Check if focus is inside the textarea, if so, allow default newline behavior
                     if (document.activeElement === taskForm.taskDescription) {
                         return; // Allow newline in textarea
                     }
                    event.preventDefault(); // Prevent default newline in other inputs
                    const submitBtn = taskForm.querySelector('button[type="submit"]');
                    if (submitBtn) submitBtn.click();
                    return;
                }

                // Escape to close modals or menus
                if (event.key === 'Escape') {
                     if (currentMenu) {
                         closeColumnMenu();
                         // Optionally return focus to the menu button
                         // event.target.closest('.column__actions').querySelector('.action-btn--menu').focus();
                     }
                    if (taskModal.classList.contains('visible')) {
                         closeModal();
                         return;
                     }
                    if (detailModal.classList.contains('visible')) {
                         closeDetailModal();
                         return;
                     }
                    if (aiInterface.classList.contains('active')) {
                         aiInterface.classList.remove('active');
                         aiInterface.setAttribute('aria-hidden', 'true');
                         // TODO: Return focus to AI toggle button?
                         return;
                     }
                     // Close column title input if active
                     const activeInput = document.querySelector('.column__title-input');
                     if (activeInput) {
                         activeInput.blur(); // Trigger blur to cancel/save
                     }
                    return;
                }

                // Enter in tag input to add tag
                if (document.activeElement === tagInput && event.key === 'Enter') {
                    event.preventDefault(); // Prevent form submission
                    if (tagInput.value.trim()) {
                        addTag(tagInput.value);
                    }
                }
            };

              return { // Expose what's needed by GLOBAL functions and event listeners
                 init,
                 closeModal,
                 closeDetailModal,
                 openTaskModal,
                 renderPgmHistory, // Needed by tabManager
                 // Expose functions needed by the *global* render/task functions
                 createTaskElement, // Needed by renderSingleTask, rerenderSingleTask
                 getTaskDataById,   // Needed by rerenderSingleTask and potentially others
                 updateColumnCounter, // Needed by global task functions
                 renderBoard,       // Needed for error recovery in moveTask
                 // Expose data needed by global task functions
                 appData,
                 // Also expose AI response handler if it needs to call global executeProposedAIActions
                 // handleAIResponse, // Keep AI handlers inside app for now
                };

        })(utils); // Pass utils object

        // --- 전역 헬퍼 함수 정의 ---
        // Define getColumnContentElement globally, BEFORE functions that use it
        const getColumnContentElement = (id) => document.getElementById('board')?.querySelector(`.column__content[data-column-id="${id}"]`);

        // Define getPgmSubColumnContentElement globally
        const getPgmSubColumnContentElement = (subColumnId) => document.getElementById(`${subColumnId}-content`);

        // Define createEmptyState globally
        const createEmptyState = () => {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = '업무가 없습니다';
            return emptyState;
        };

        // --- 단일 태스크 렌더링 함수들 (Global) ---
        const renderSingleTask = (task) => {
            // console.log(`[renderSingleTask] Called for task: ${task.id} in column: ${task.columnId}`); // 주석 처리
            // 수정: PGM 컬럼도 처리할 수 있도록 수정
            const pgmColumns = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'];
            const isPgmColumn = pgmColumns.includes(task.columnId);

            let columnContent;
            if (isPgmColumn) {
                // PGM 컬럼인 경우 해당 서브컬럼 콘텐츠 요소 획득
                columnContent = getPgmSubColumnContentElement(task.columnId);
                // console.log(`[renderSingleTask] Task is for PGM column: ${task.columnId}, container found:`, !!columnContent); // 주석 처리
            } else {
                // 메인 대시보드 컬럼인 경우 기존 함수 사용
                columnContent = getColumnContentElement(task.columnId);
                // console.log(`[renderSingleTask] Task is for Dashboard column: ${task.columnId}, container found:`, !!columnContent); // 주석 처리
            }

            if (!columnContent) {
                console.warn(`[renderSingleTask] 컬럼 콘텐츠 요소를 찾을 수 없음 (ID: ${task.columnId}, isPGM: ${isPgmColumn})`);
                return;
            }

            // Rely on updateColumnCounter to handle empty state

            const taskEl = app.createTaskElement(task); // Use exposed app.createTaskElement
            // 빈 상태 제거
            const emptyState = columnContent.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
            columnContent.appendChild(taskEl);
            // console.log(`[renderSingleTask] Successfully rendered task ${task.id} to column ${task.columnId}`); // 주석 처리

            // 대시보드 카운터 업데이트 (PGM 컬럼은 카운터가 없음)
            if (!isPgmColumn && typeof app.updateColumnCounter === 'function') {
                app.updateColumnCounter(task.columnId);
            }
        };

        const rerenderSingleTask = (taskId) => {
            const task = app.getTaskDataById(taskId); // Use exposed app.getTaskDataById
            if (!task) return; // 태스크 데이터가 없으면 종료

            // PGM 컬럼과 메인 대시보드 컬럼 모두에서 요소를 찾도록 수정
            const existingTaskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);
            if (!existingTaskEl) {
                 // 요소가 없을 경우 특별한 처리는 하지 않음 (updateTask 등에서 이미 확인됨)
                 console.warn(`[rerenderSingleTask] Task element not found for ID: ${taskId}`);
                 return;
            }

            const newTaskEl = app.createTaskElement(task); // Use exposed app.createTaskElement
            existingTaskEl.replaceWith(newTaskEl);
        };

        // --- Task Management (Global) ---
        const addTask = async (taskData) => {
            const newTask = { id: utils.generateId(), completed: false, priority: 'medium', ...taskData };
            try {
                const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTask) });
                if (!response.ok) { const errorBody = await response.text(); throw new Error(`태스크 추가 실패 (${response.status}): ${errorBody}`); }
                const addedTask = await response.json();
                // console.log('[addTask] Server returned task:', JSON.stringify(addedTask)); // 주석 처리

                // 로컬 데이터 업데이트 전 appData 확인
                if (!app || !app.appData || !Array.isArray(app.appData.tasks)) {
                     console.error('[addTask] app.appData.tasks is not available or not an array!');
                     alert("데이터 저장 및 화면 업데이트에 실패했습니다. (appData 오류)");
                     return;
                }
                app.appData.tasks.push(addedTask); // 이제 안전하게 로컬 데이터 추가

                const pgmColumns = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'];
                const intendedColumnId = addedTask.columnId; // 서버 응답 기준 ID 사용
                // console.log(`[addTask] Intended column for new task: ${intendedColumnId}`); // 주석 처리

                if (pgmColumns.includes(intendedColumnId)) {
                    // PGM 컬럼인 경우: DOM 직접 조작
                    // console.log(`[addTask] Column ${intendedColumnId} is PGM. Manipulating DOM directly.`); // 주석 처리
                    const subColumnContent = getPgmSubColumnContentElement(intendedColumnId);
                    if (subColumnContent) {
                        const emptyState = subColumnContent.querySelector('.empty-state');
                        if (emptyState) emptyState.remove(); // 빈 상태 메시지 제거
                        const taskEl = app.createTaskElement(addedTask);
                        subColumnContent.appendChild(taskEl);
                    } else {
                        console.warn(`[addTask] PGM sub-column content element not found for ID: ${intendedColumnId}`);
                    }
                } else {
                    // 메인 대시보드 컬럼인 경우: renderSingleTask 호출
                    // console.log(`[addTask] Column ${intendedColumnId} is Dashboard. Calling renderSingleTask.`); // 주석 처리
                    renderSingleTask(addedTask); // 이 함수는 내부적으로 getColumnContentElement를 사용 (대시보드 전용)
                    if (typeof app.updateColumnCounter === 'function') {
                         app.updateColumnCounter(intendedColumnId); // 추가된 대시보드 컬럼 카운터 업데이트
                    } else {
                         console.error('[addTask] app.updateColumnCounter function not found!');
                    }
                }
                // console.log(`[addTask] Finished for ${addedTask.id}`); // 주석 처리

            } catch (error) { console.error("태스크 추가 오류:", error); alert("태스크 추가에 실패했습니다: " + error.message); }
        };

        const updateTask = async (taskId, updatedData) => {
            let payload = { ...updatedData };
            // currentTags는 모달 스코프 내에서 관리되므로, 여기서는 updatedData에 이미 포함된 것을 사용한다고 가정
            // 또는 handleFormSubmit에서 tags를 포함하여 전달해야 함.
            // 여기서는 payload에 tags가 있다고 가정하고 진행.

            const taskIndex = app.appData.tasks.findIndex(task => task.id === taskId); // Use exposed app.appData - OK
            if (taskIndex === -1) {
                console.error(`[updateTask] Task not found in appData with ID: ${taskId}`);
                return;
            }
            const originalColumnId = app.appData.tasks[taskIndex].columnId; // 원래 컬럼 ID 저장
            const newColumnId = payload.columnId || originalColumnId; // 업데이트될 컬럼 ID

            try {
                const response = await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) { const errorBody = await response.text(); throw new Error(`태스크 수정 실패 (${response.status}): ${errorBody}`); }
                const returnedTask = await response.json(); // 서버 응답 받기

                // 서버 응답 기반으로 로컬 데이터 업데이트
                app.appData.tasks[taskIndex] = { ...app.appData.tasks[taskIndex], ...returnedTask }; // 서버 응답으로 덮어쓰기
                const updatedTask = app.appData.tasks[taskIndex]; // 업데이트된 태스크 정보

                // --- 수정: PGM 히스토리 탭 또는 메인 보드 갱신 로직 ---
                const pgmColumns = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'];
                const isOriginalPgm = pgmColumns.includes(originalColumnId);
                const isNewPgm = pgmColumns.includes(updatedTask.columnId);

                // console.log(`[updateTask] Task ${taskId} updated. Original Col: ${originalColumnId} (PGM: ${isOriginalPgm}), New Col: ${updatedTask.columnId} (PGM: ${isNewPgm})`); // 주석 처리

                // Case 1: 컬럼 이동 없음
                if (originalColumnId === updatedTask.columnId) {
                    if (isNewPgm) {
                        // PGM 내에서 내용만 변경: rerenderSingleTask 사용 (PGM 요소도 찾아 교체함)
                        // console.log(`[updateTask] PGM task content updated. Calling rerenderSingleTask.`); // 주석 처리
                        rerenderSingleTask(taskId);
                    } else {
                        // Dashboard 내에서 내용만 변경: rerenderSingleTask 사용
                        // console.log(`[updateTask] Dashboard task content updated. Calling rerenderSingleTask.`); // 주석 처리
                        rerenderSingleTask(taskId);
                        // 카운터는 변경 없으므로 업데이트 불필요
                    }
                }
                // Case 2: 컬럼 이동 발생
                else {
                    // console.log(`[updateTask] Column move detected: ${originalColumnId} -> ${updatedTask.columnId}`); // 주석 처리
                    // 기존 위치에서 DOM 요소 제거
                    const existingTaskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);
                    if (existingTaskEl) {
                        const sourceColumnContent = existingTaskEl.parentElement;
                        existingTaskEl.remove();
                        // 이전 컬럼 처리 (Empty State 및 카운터)
                        if (isOriginalPgm) {
                             if (sourceColumnContent && sourceColumnContent.children.length === 0) {
                                sourceColumnContent.appendChild(createEmptyState());
                             }
                        } else {
                             app.updateColumnCounter(originalColumnId); // Dashboard 카운터 업데이트
                             if (sourceColumnContent && !sourceColumnContent.querySelector('.task:not([style*="display: none"])')) {
                                // If dashboard column is now empty (considering filters), add empty state if not present
                                if (!sourceColumnContent.querySelector('.empty-state')) {
                                    sourceColumnContent.appendChild(createEmptyState());
                                }
                             }
                        }
                    }

                    // 새 위치에 DOM 요소 추가
                    const newTaskEl = app.createTaskElement(updatedTask);
                    if (isNewPgm) {
                        // PGM으로 이동: 새 PGM 컬럼에 추가
                        const targetPgmContent = getPgmSubColumnContentElement(updatedTask.columnId);
                        if (targetPgmContent) {
                             const emptyState = targetPgmContent.querySelector('.empty-state');
                             if (emptyState) emptyState.remove();
                             targetPgmContent.appendChild(newTaskEl);
                        }
                    } else {
                        // Dashboard로 이동: 새 Dashboard 컬럼에 추가
                        const targetDashContent = getColumnContentElement(updatedTask.columnId);
                        if (targetDashContent) {
                            const emptyState = targetDashContent.querySelector('.empty-state');
                            if (emptyState) emptyState.remove();
                            targetDashContent.appendChild(newTaskEl);
                            app.updateColumnCounter(updatedTask.columnId); // Dashboard 카운터 업데이트
                        }
                    }
                }
                // ---------------------------------------------------
            } catch (error) {
                 console.error("태스크 수정 오류:", error); alert("태스크 수정에 실패했습니다: " + error.message);
                 // 오류 발생 시 전체 렌더링으로 복구 시도 (선택적)
                 app.renderBoard();
                 app.renderPgmHistory();
            }
        };

         const deleteTask = async (taskId) => {
             // console.log(`[deleteTask] Initiated for task ID: ${taskId}`); // 주석 처리
             const taskIndex = app.appData.tasks.findIndex(task => task.id === taskId);
             if (taskIndex === -1) {
                 console.error(`[deleteTask] Task ID ${taskId} not found in local appData.tasks.`);
                 alert("오류: 삭제하려는 태스크를 찾을 수 없습니다.");
                 return;
             }

             // Optimistic UI: Remove from local data and DOM first
             const deletedTask = app.appData.tasks.splice(taskIndex, 1)[0]; // Remove from local array and store it
             const columnId = deletedTask.columnId;
             const pgmColumns = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'];
             const taskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);
             let parentColumnContent = null;

             if (taskEl) {
                 parentColumnContent = taskEl.parentElement;
                 taskEl.remove(); // Remove from DOM
                 // console.log(`[deleteTask] Optimistically removed task ${taskId} from DOM.`); // 주석 처리

                 // Update UI for the column it was removed from
                 if (pgmColumns.includes(columnId)) {
                     // Check if PGM column is now empty
                     if (parentColumnContent && parentColumnContent.children.length === 0) {
                         parentColumnContent.appendChild(createEmptyState());
                         // console.log(`[deleteTask] Added empty state to PGM column ${columnId}.`); // 주석 처리
                     }
                 } else {
                     // Update Dashboard column counter and check empty state
                     app.updateColumnCounter(columnId);
                     if (parentColumnContent && !parentColumnContent.querySelector('.task:not([style*="display: none"])') && !parentColumnContent.querySelector('.empty-state')) {
                         parentColumnContent.appendChild(createEmptyState());
                         // console.log(`[deleteTask] Added empty state to Dashboard column ${columnId}.`); // 주석 처리
                     }
                 }
             } else {
                 console.warn(`[deleteTask] Task element ${taskId} not found in DOM for optimistic removal.`);
                 // If element wasn't found but data existed, maybe PGM history wasn't rendered yet. Re-render it.
                 if (pgmColumns.includes(columnId)) {
                     // console.log("[deleteTask] Task element not in DOM, forcing PGM history render after data removal."); // 주석 처리
                     app.renderPgmHistory();
                 }
             }

             // Now, try deleting from the server
             try {
                 // console.log(`[deleteTask] Sending DELETE request to server for task ID: ${taskId}`); // 주석 처리
                 const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });

                 if (!response.ok) {
                     // Check if the reason for failure is 404 (Not Found)
                     if (response.status === 404) {
                         console.warn(`[deleteTask] Server returned 404 for task ${taskId}. Assuming already deleted or race condition.`);
                         // Treat 404 as a success locally since the goal is removal
                         // UI is already updated optimistically.
                     } else {
                         // Handle other server errors
                         const errorBody = await response.text();
                         throw new Error(`태스크 삭제 실패 (${response.status}): ${errorBody}`);
                     }
                 } else {
                    // console.log(`[deleteTask] Successfully deleted task ${taskId} on server.`); // 주석 처리
                    // Success: UI is already updated. Nothing more to do.
                 }

             } catch (error) {
                  // This catch block now only handles non-404 errors thrown above or network errors
                  console.error(`[deleteTask] Server delete failed for task ${taskId}:`, error);
                  alert("태스크 삭제에 실패했습니다. 변경 사항을 되돌립니다. " + error.message);

                  // Rollback: Add the task back to local data
                  app.appData.tasks.splice(taskIndex, 0, deletedTask); // Insert back at original index
                  // console.log(`[deleteTask] Rolled back local data for task ${taskId}.`); // 주석 처리

                  // Rollback DOM changes
                  // It's simpler to just re-render the affected column/tab
                  if (pgmColumns.includes(columnId)) {
                      // console.log(`[deleteTask] Rolling back UI for PGM column ${columnId} by re-rendering.`); // 주석 처리
                      app.renderPgmHistory();
                  } else {
                      // console.log(`[deleteTask] Rolling back UI for Dashboard column ${columnId} by re-rendering board.`); // 주석 처리
                      app.renderBoard(); // Re-render the whole board might be easiest for dashboard rollback
                  }
             }
         };

         const toggleComplete = async (taskId) => {
            const taskIndex = app.appData.tasks.findIndex(task => task.id === taskId);
            if (taskIndex === -1) {
                console.error(`[toggleComplete] Task ID ${taskId} not found in local appData.tasks.`);
                return;
            }

            const task = { ...app.appData.tasks[taskIndex] }; // Work with a copy for modifications
            const newCompletedStatus = !task.completed;
            let newColumnId = task.columnId; // Start with current columnId
            let newOriginalColumnIdBeforeCompletion = task.originalColumnIdBeforeCompletion; // Start with current

            const welldoneColumnId = 'welldone';
            const updatePayload = { completed: newCompletedStatus };

            if (newCompletedStatus) { // Task is being marked as COMPLETED
                if (task.columnId !== welldoneColumnId) { // Only move if not already in welldone
                    newOriginalColumnIdBeforeCompletion = task.columnId; // Store current column
                    newColumnId = welldoneColumnId;                   // Target 'welldone'
                    updatePayload.originalColumnIdBeforeCompletion = newOriginalColumnIdBeforeCompletion;
                    updatePayload.columnId = newColumnId;
                }
                // If already in welldone and being marked complete, no column change, just status.
            } else { // Task is being marked as INCOMPLETE
                if (task.columnId === welldoneColumnId && task.originalColumnIdBeforeCompletion) {
                    // If in welldone and has an original column, move it back
                    newColumnId = task.originalColumnIdBeforeCompletion;
                    newOriginalColumnIdBeforeCompletion = null; // Clear it as it's no longer 'pending return'
                    updatePayload.columnId = newColumnId;
                    updatePayload.originalColumnIdBeforeCompletion = null;
                } else if (task.columnId === welldoneColumnId && !task.originalColumnIdBeforeCompletion) {
                    // If in welldone, being unchecked, but has NO original column (e.g., created in welldone)
                    // It should remain in welldone, just uncompleted.
                    // No change to columnId or originalColumnIdBeforeCompletion needed beyond what's in task.
                }
            }

            try {
                const response = await fetchWithAuth(`/api/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`완료 상태 변경 및 이동 실패: ${errorBody}`);
                }
                const updatedTaskFromServer = await response.json();

                // Update local task data with the full response from the server
                app.appData.tasks[taskIndex] = { ...app.appData.tasks[taskIndex], ...updatedTaskFromServer };

                const currentTaskStateInApp = app.appData.tasks[taskIndex]; // Use the updated state from appData

                // UI update
                const taskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);

                if (taskEl) {
                    const checkbox = taskEl.querySelector('.task__checkbox');
                    if (checkbox) checkbox.checked = currentTaskStateInApp.completed;
                    taskEl.querySelector('.task__title')?.classList.toggle('task__title--completed', currentTaskStateInApp.completed);
                }

                if (task.columnId !== currentTaskStateInApp.columnId) { // Check if column actually changed
                    // Remove from old DOM column
                    if (taskEl && taskEl.parentElement) {
                        const oldColumnContentEl = taskEl.parentElement;
                        const oldColumnId = task.columnId; // ID before update
                        taskEl.remove();

                        if (PGM_COLUMN_IDS.includes(oldColumnId)) {
                            if (oldColumnContentEl.children.length === 0 && !oldColumnContentEl.querySelector('.empty-state')) {
                                oldColumnContentEl.appendChild(createEmptyState());
                            }
                        } else {
                            app.updateColumnCounter(oldColumnId);
                            if (!oldColumnContentEl.querySelector('.task:not([style*="display: none"])') && !oldColumnContentEl.querySelector('.empty-state')) {
                                oldColumnContentEl.appendChild(createEmptyState());
                            }
                        }
                    }

                    // Add to new DOM column
                    const targetNewColumnId = currentTaskStateInApp.columnId;
                    const newColumnContentEl = PGM_COLUMN_IDS.includes(targetNewColumnId) ?
                                               getPgmSubColumnContentElement(targetNewColumnId) :
                                               getColumnContentElement(targetNewColumnId);

                    if (newColumnContentEl) {
                        const emptyState = newColumnContentEl.querySelector('.empty-state');
                        if (emptyState) emptyState.remove();

                        const freshTaskEl = app.createTaskElement(currentTaskStateInApp); // Create element with latest data
                        newColumnContentEl.appendChild(freshTaskEl);

                        if (!PGM_COLUMN_IDS.includes(targetNewColumnId)) {
                            app.updateColumnCounter(targetNewColumnId);
                        }
                    } else {
                        console.warn(`Target column ${targetNewColumnId} not found in DOM. Full render might be needed.`);
                        app.renderBoard();
                        app.renderPgmHistory();
                    }
                } else {
                    // Column did not change, just re-render the task in place if it exists
                    if(taskEl) {
                        rerenderSingleTask(taskId);
                    }
                }
            } catch (error) {
                if (error.message === '세션 만료') return; // Already handled by fetchWithAuth
                console.error("완료 상태 변경 중 오류:", error);
                alert("작업 완료 상태 변경 또는 이동에 실패했습니다: " + error.message + "\n문제가 지속되면 페이지를 새로고침 해주세요.");
                // Rollback local data to pre-API call state
                app.appData.tasks[taskIndex] = task; // Restore the original task object copy
                // Force re-render to reflect original state
                app.renderBoard();
                app.renderPgmHistory();
            }
        };

         const moveTask = async (taskId, targetColumnId, insertBeforeTaskId = null) => {
             const taskIndex = app.appData.tasks.findIndex(t => t.id === taskId); // Use exposed app.appData - OK
             if (taskIndex === -1) {
                 console.error(`[moveTask] Task ${taskId} not found in local data.`);
                 return;
             }
             const originalColumnId = app.appData.tasks[taskIndex].columnId; // Use exposed app.appData - OK

             // 이동 전 UI 변경 (Optimistic UI)
             const taskEl = document.querySelector(`.task[data-task-id="${taskId}"]`);
             const pgmColumns = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'];
             const isTargetPgm = pgmColumns.includes(targetColumnId);
             const isOriginalPgm = pgmColumns.includes(originalColumnId);

             let targetColumnContent = isTargetPgm ? getPgmSubColumnContentElement(targetColumnId) : getColumnContentElement(targetColumnId);

             if (taskEl && targetColumnContent) {
                 const originalColumnContent = taskEl.parentElement;
                 const insertBeforeEl = insertBeforeTaskId ? targetColumnContent.querySelector(`.task[data-task-id="${insertBeforeTaskId}"]`) : null;

                 // 새 위치에 삽입
                 targetColumnContent.insertBefore(taskEl, insertBeforeEl);

                 // 빈 상태 메시지 처리 (목표 컬럼)
                 const targetEmptyState = targetColumnContent.querySelector('.empty-state');
                 if (targetEmptyState) targetEmptyState.remove();

                 // 이전 컬럼 처리 (카운터 및 빈 상태)
                 if (originalColumnId !== targetColumnId && originalColumnContent) {
                     if (isOriginalPgm) {
                         if (originalColumnContent.children.length === 0) {
                             originalColumnContent.appendChild(createEmptyState());
                         }
                     } else {
                         app.updateColumnCounter(originalColumnId);
                         if (!originalColumnContent.querySelector('.task:not([style*="display: none"])') && !originalColumnContent.querySelector('.empty-state')) {
                            originalColumnContent.appendChild(createEmptyState());
                         }
                     }
                 }

                 // 목표 컬럼 카운터 업데이트 (Dashboard인 경우)
                 if (!isTargetPgm) {
                     app.updateColumnCounter(targetColumnId);
                 }

                 // console.log(`[moveTask] Optimistically moved task ${taskId} from ${originalColumnId} to ${targetColumnId}`); // 주석 처리
             } else {
                 console.warn(`[moveTask] Optimistic move failed: Task element or target column not found.`);
             }

             // 서버에 업데이트 요청
             try {
                 const response = await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ columnId: targetColumnId }) });
                 if (!response.ok) { const errorBody = await response.text(); throw new Error(`태스크 이동 실패 (${response.status}): ${errorBody}`); }
                 // 서버 성공 시 로컬 데이터 업데이트
                 app.appData.tasks[taskIndex].columnId = targetColumnId; // Update exposed app.appData - OK
                 // console.log(`[moveTask] Successfully updated task ${taskId} column to ${targetColumnId} on server.`); // 주석 처리
             } catch (error) {
                 console.error("태스크 이동 오류:", error); alert("태스크 이동에 실패했습니다: " + error.message);
                 // 실패 시 전체 UI 롤백
                 // console.log("[moveTask] Rolling back UI due to server error."); // 주석 처리
                 app.renderBoard(); // Use exposed app.renderBoard - OK
                 app.renderPgmHistory(); // Use exposed app.renderPgmHistory - OK
             }
         };

        // --- AI 액션 실행 함수 (GLOBAL) ---
        const executeProposedAIActions = async (actions) => {
            // ... definition using GLOBAL task functions (addTask, updateTask, deleteTask, moveTask)
            let performedActions = false;
            let actionResults = [];
            const promises = [];
            try {
                actions.forEach(action => {
                    const { type, payload } = action;
                    try {
                        switch (type) {
                            case 'add':
                                if (payload.columnId && payload.title) {
                                    promises.push(addTask({ ...payload }).then(() => `✅ '${payload.title}' 추가 완료.`).catch(e => `❌ '${payload.title}' 추가 오류: ${e.message}`));
                                    performedActions = true;
                                } else { throw new Error("Add: 필요한 정보 부족"); }
                                break;
                            case 'update':
                                if (payload.taskId && payload.updates) {
                                    const task = app.getTaskDataById(payload.taskId);
                                    if (task) {
                                        promises.push(updateTask(payload.taskId, { ...task, ...payload.updates }).then(() => `✅ '${task.title}' 수정 완료.`).catch(e => `❌ '${task.title}' 수정 오류: ${e.message}`));
                                        performedActions = true;
                                    } else { throw new Error(`Update: ID ${payload.taskId} 없음`); }
                                } else { throw new Error("Update: 필요한 정보 부족"); }
                                break;
                            case 'delete':
                                if (payload.taskId) {
                                    const task = app.getTaskDataById(payload.taskId);
                                    if (task) {
                                        const taskTitle = task.title;
                                        promises.push(deleteTask(payload.taskId).then(() => `✅ '${taskTitle}' 삭제 완료.`).catch(e => `❌ '${taskTitle}' 삭제 오류: ${e.message}`));
                                        performedActions = true;
                                    } else { throw new Error(`Delete: ID ${payload.taskId} 없음`); }
                                } else { throw new Error("Delete: 필요한 정보 부족"); }
                                break;
                            case 'move':
                                if (payload.taskId && payload.targetColumnId) {
                                    const task = app.getTaskDataById(payload.taskId);
                                    const column = app.appData.columns.find(c => c.id === payload.targetColumnId);
                                    if (task && column) {
                                        promises.push(moveTask(payload.taskId, payload.targetColumnId).then(() => `✅ '${task.title}' 이동 완료.`).catch(e => `❌ '${task.title}' 이동 오류: ${e.message}`));
                                        performedActions = true;
                                    } else { throw new Error("Move: 업무 또는 컬럼 없음"); }
                                } else { throw new Error("Move: 필요한 정보 부족"); }
                                break;
                            case 'info': actionResults.push(`ℹ️ 정보 조회 완료.`); break;
                            default: actionResults.push(`⚠️ 알 수 없는 액션 '${type}'`);
                        }
                    } catch (actionError) { actionResults.push(`❌ ${type} 준비 오류: ${actionError.message}`); }
                });
                const results = await Promise.all(promises);
                actionResults = actionResults.concat(results);
                const aiResponseElement = document.getElementById('aiResponse');
                if (aiResponseElement) {
                    const successMessages = actionResults.filter(r => r.startsWith('✅') || r.startsWith('ℹ️')).join('<br>');
                    const errorMessages = actionResults.filter(r => r.startsWith('❌') || r.startsWith('⚠️')).join('<br>');
                    aiResponseElement.innerHTML = `<div class='ai-success'>${successMessages || '요청 완료 (변경 없음).'}</div>`;
                    if (errorMessages) { aiResponseElement.innerHTML += `<div class='ai-error' style='margin-top: 10px;'><strong>일부 실패:</strong><br>${errorMessages}</div>`; }
                }
            } catch (globalError) {
                console.error("AI 액션 실행 오류:", globalError);
                const aiResponseElement = document.getElementById('aiResponse');
                if (aiResponseElement) { aiResponseElement.innerHTML = `<div class='ai-error'>⚠️ AI 실행 중 예외: ${utils.escapeHtml(globalError.message)}</div>`; }
            }
        };

        // --- 애플리케이션 시작 ---
        document.addEventListener('DOMContentLoaded', () => {
            // console.log("DOM 로드됨, 애플리케이션 초기화 시작..."); // 주석 처리
            app.init().then(() => {
                // console.log("애플리케이션이 성공적으로 초기화되었습니다."); // 주석 처리
            }).catch(error => {
                console.error("애플리케이션 초기화 중 최종 오류:", error);
                alert("애플리케이션 초기화에 실패했습니다. 페이지를 새로고침하거나 나중에 다시 시도해주세요.");
            });
        });

        // 인증 확인 및 사용자 정보 로드 함수
        async function checkAuth() {
            try {
                const response = await fetch('/api/auth-status');
                const data = await response.json();

                if (!data.isAuthenticated) {
                    // 인증되지 않은 경우 로그인 페이지로 리디렉션
                    window.location.replace('/login.html');
                    return false;
                }

                // 사용자 정보 로드
                const userInfo = document.getElementById('userInfo');
                if (userInfo && data.user) {
                    userInfo.textContent = `${data.user.name || ''} (${data.user.employeeId})`;
                }
                return true;
            } catch (error) {
                console.error('인증 확인 중 오류:', error);
                // 오류 발생 시 로그인 페이지로 리디렉션
                window.location.replace('/login.html');
                return false;
            }
        }

        // 로그아웃 함수
        async function logout() {
            try {
                const response = await fetch('/api/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    // 로그아웃 성공 시 로그인 페이지로 리디렉션
                    // history 객체를 교체하여 뒤로가기 시 이전 페이지로 돌아가지 않도록 함
                    window.location.replace('/login.html');
                } else {
                    console.error('로그아웃 실패');
                }
            } catch (error) {
                console.error('로그아웃 처리 중 오류:', error);
            }
        }

        // 세션 만료 처리 함수 (다른 곳에서 로그인하여 현재 세션이, 무효화된 경우)
        function handleSessionExpired(error) {
            if (error && error.sessionExpired) {
                // 세션 만료 알림 표시
                alert('다른 위치에서 로그인하여 현재 세션이 종료되었습니다. 다시 로그인해주세요.');
                // 로그인 페이지로 리디렉션
                window.location.replace('/login.html?sessionExpired=true');
                return true;
            }
            return false;
        }

        // API 요청 래퍼 함수 (세션 만료 처리 포함)
        async function fetchWithAuth(url, options = {}) {
            try {
                const response = await fetch(url, options);

                if (response.status === 401) {
                    // 401 응답 확인
                    const errorData = await response.json();

                    // 세션 만료 여부 확인 및 처리
                    if (handleSessionExpired(errorData)) {
                        // 세션 만료 처리됨
                        throw new Error('세션 만료');
                    }
                }

                return response;
            } catch (error) {
                // 다른 오류 그대로 전달
                throw error;
            }
        }

        // 페이지 로드 시 인증 확인
        document.addEventListener('DOMContentLoaded', async () => {
            // 인증 확인
            const isAuthenticated = await checkAuth();

            // 로그아웃 버튼 이벤트 리스너 등록
            const logoutButton = document.getElementById('logoutButton');
            if (logoutButton) {
                logoutButton.addEventListener('click', logout);
            }
        });

        // 컬럼 내 태스크 정렬 및 재렌더링 함수
        const sortAndRenderColumn = (columnId, sortBy, direction) => {
            // 컬럼이 메인 보드 컬럼인지 PGM 서브컬럼인지 확인
            const isPgmSubColumn = ['AVI-red', 'AVI-yellow', 'ATTACH-black', 'ATTACH-pink'].includes(columnId);

            // 해당 컬럼의 태스크 가져오기
            const tasks = appData.tasks.filter(task => task.columnId === columnId);

            // 정렬 로직
            const sortedTasks = [...tasks].sort((a, b) => {
                if (sortBy === 'date') {
                    // 날짜 정렬 (없으면 맨 뒤로)
                    const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
                    const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
                    return direction === 'asc' ? dateA - dateB : dateB - dateA;
                } else if (sortBy === 'priority') {
                    // 중요도 정렬 (high > medium > low)
                    const priorityWeight = { 'high': 3, 'medium': 2, 'low': 1 };
                    const weightA = priorityWeight[a.priority] || 0;
                    const weightB = priorityWeight[b.priority] || 0;
                    return direction === 'asc' ? weightA - weightB : weightB - weightA;
                }
                return 0;
            });

            // 정렬된 결과 화면에 적용
            if (isPgmSubColumn) {
                // PGM 서브 컬럼인 경우
                const contentEl = getPgmSubColumnContentElement(columnId);
                if (contentEl) {
                    contentEl.innerHTML = ''; // 기존 내용 비우기
                    if (sortedTasks.length === 0) {
                        contentEl.appendChild(createEmptyState());
                    } else {
                        sortedTasks.forEach(task => {
                            try {
                                const taskEl = createTaskElement(task);
                                contentEl.appendChild(taskEl);
                            } catch (error) {
                                console.error(`정렬 오류: ${error.message}`);
                            }
                        });
                    }
                }
            } else {
                // 메인 보드 컬럼인 경우
                const contentEl = document.querySelector(`.column__content[data-column-id="${columnId}"]`);
                if (contentEl) {
                    contentEl.innerHTML = ''; // 기존 내용 비우기
                    if (sortedTasks.length === 0) {
                        contentEl.appendChild(createEmptyState());
                    } else {
                        sortedTasks.forEach(task => {
                            try {
                                const taskEl = createTaskElement(task);
                                contentEl.appendChild(taskEl);
                            } catch (error) {
                                console.error(`정렬 오류: ${error.message}`);
                            }
                        });
                    }
                }
            }

            // 성공 메시지
            const sortTypeText = sortBy === 'date' ? '날짜' : '중요도';
            const directionText = direction === 'asc' ? '오름차순' : '내림차순';
            utils.showFeedback(`${sortTypeText} ${directionText}으로 정렬했습니다.`);
        };

        // 컬럼 요소 가져오기
        const getColumnElementById = (columnId) => {
            return document.querySelector(`[data-column-id="${columnId}"]`);
        };

        // PGM_COLUMN_IDS를 전역으로 옮겼으므로, 로컬 pgmColumns 변수 사용 부분들을 PGM_COLUMN_IDS로 대체
        // 예: renderSingleTask, addTask, updateTask, deleteTask, moveTask, sortAndRenderColumn 내 pgmColumns 변수들
