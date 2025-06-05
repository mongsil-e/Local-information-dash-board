// 페이지 로드 시 자동으로 로그인 여부 확인
        document.addEventListener('DOMContentLoaded', async () => {
            // Add these lines to set initial form states
            loginForm.style.display = "block"; // Default visible
            changePasswordForm.style.display = "none"; // Default hidden

            try {
                // 뒤로가기 방지를 위한 history 처리
                history.pushState(null, null, location.href);
                window.onpopstate = function() {
                    history.go(1);
                };

                // 오류 메시지 스타일 초기화
                errorMessage.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
                errorMessage.style.fontWeight = 'normal';
                errorMessage.style.display = 'none';

                // URL 파라미터 확인 (세션 만료 여부)
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('sessionExpired') === 'true') {
                    // 세션 만료 메시지 표시
                    errorMessage.textContent = '다른 위치에서 로그인하여 현재 세션이 종료되었습니다. 다시 로그인해주세요.';
                    errorMessage.style.backgroundColor = 'rgba(243, 156, 18, 0.2)'; // 주황색 배경 (경고)
                    errorMessage.style.fontWeight = 'normal';
                    errorMessage.style.display = 'block';
                }

                // 인증 상태 확인
                const response = await fetch('/api/auth-status');
                const data = await response.json();

                if (data.isAuthenticated) {
                    // 이미 로그인된 상태라면 메인 페이지로 리디렉션
                    window.location.replace('/');
                }
            } catch (error) {
                // 오류가 발생해도 계속 진행 (로그인 안 된 상태로 간주)
                console.error('로그인 상태 확인 중 오류:', error);
                loginForm.style.display = "block"; // Ensure login form is visible
                changePasswordForm.style.display = "none"; // Ensure change password form is hidden
            }
        });

        const loginForm = document.getElementById('loginForm');
        const employeeIdInput = document.getElementById('employeeId');
        const passwordInput = document.getElementById('password');
        const errorMessage = document.getElementById('errorMessage');

        // 비밀번호 변경 폼 요소 참조 추가
        const changePasswordForm = document.getElementById('changePasswordForm');
        const changePasswordEmployeeIdInput = document.getElementById('changePasswordEmployeeId');
        const currentPasswordInput = document.getElementById('currentPassword');
        const newPasswordInput = document.getElementById('newPassword');
        const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
        const changePasswordErrorMessage = document.getElementById('changePasswordErrorMessage');

        // 로그인 폼 제출 이벤트 리스너
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // 폼 기본 제출 방지
            errorMessage.style.display = 'none'; // 이전 에러 메시지 숨김
            changePasswordErrorMessage.style.display = 'none'; // 비밀번호 변경 에러 메시지도 숨김

            const employeeId = employeeIdInput.value.trim();
            const password = passwordInput.value;

            if (!employeeId || !password) {
                errorMessage.textContent = '사번과 비밀번호를 모두 입력해주세요.';
                errorMessage.style.display = 'block';
                loginForm.style.display = "block"; // Ensure login form is visible
                changePasswordForm.style.display = "none"; // Ensure change password form is hidden
                return;
            }

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ employeeId: employeeId, password: password }),
                });

                if (response.ok) {
                    // 로그인 성공 (JWT는 서버에서 쿠키로 자동 설정됨)
                    const data = await response.json();
                    console.log('로그인 응답:', data);

                    if (data.mustChangePassword === true) {
                        // 비밀번호 변경 필요
                        console.log('비밀번호 변경 필요');
                        errorMessage.textContent = data.message || '비밀번호 변경이 필요합니다.'; // 안내 메시지 표시
                        errorMessage.style.display = 'block';

                        loginForm.style.display = 'none';
                        changePasswordForm.style.display = 'block';

                        changePasswordEmployeeIdInput.value = employeeId;
                        currentPasswordInput.focus();
                    } else {
                        // 비밀번호 변경 불필요 (정상 로그인 성공)
                        console.log('로그인 성공, 메인 페이지로 이동');
                        window.location.replace('/');
                    }
                } else {
                    // 로그인 실패
                    const errorData = await response.json();

                    if (response.status === 429) {
                        errorMessage.textContent = errorData.error || '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.';
                        errorMessage.style.backgroundColor = 'rgba(231, 76, 60, 0.2)';
                        errorMessage.style.fontWeight = 'bold';
                    } else {
                        errorMessage.textContent = errorData.error || '로그인 실패. 다시 시도해주세요.';
                        errorMessage.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
                        errorMessage.style.fontWeight = 'normal';
                    }

                    errorMessage.style.display = 'block';
                    loginForm.style.display = 'block'; // Ensure login form is visible on error
                    changePasswordForm.style.display = 'none'; // Ensure change pwd form is hidden
                    console.error('로그인 실패:', response.status, errorData);
                }
            } catch (error) {
                errorMessage.textContent = '로그인 요청 중 오류 발생. 네트워크 연결을 확인해주세요.';
                errorMessage.style.display = 'block';
                loginForm.style.display = 'block'; // Ensure login form is visible on catch
                changePasswordForm.style.display = 'none'; // Ensure change pwd form is hidden
                console.error('로그인 요청 오류:', error);
            }
        });

        // 비밀번호 변경 폼 제출 이벤트 리스너 추가
        changePasswordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            changePasswordErrorMessage.style.display = 'none'; // 이전 에러 메시지 숨김

            const employeeId = changePasswordEmployeeIdInput.value;
            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            const confirmNewPassword = confirmNewPasswordInput.value;

            if (!currentPassword || !newPassword || !confirmNewPassword) {
                changePasswordErrorMessage.textContent = '모든 필드를 입력해주세요.';
                changePasswordErrorMessage.style.display = 'block';
                return;
            }

            if (newPassword !== confirmNewPassword) {
                changePasswordErrorMessage.textContent = '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.';
                changePasswordErrorMessage.style.display = 'block';
                return;
            }

            if (newPassword.length < 6) {
                changePasswordErrorMessage.textContent = '새 비밀번호는 6자 이상이어야 합니다.';
                changePasswordErrorMessage.style.display = 'block';
                return;
            }

            try {
                const response = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        employeeId: employeeId,
                        currentPassword: currentPassword,
                        newPassword: newPassword
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('비밀번호 변경 성공:', data);
                    alert('비밀번호가 성공적으로 변경되었습니다. 메인 페이지로 이동합니다.');
                    window.location.replace('/');
                } else {
                    const errorData = await response.json();
                    changePasswordErrorMessage.textContent = errorData.error || '비밀번호 변경 실패. 다시 시도해주세요.';
                    changePasswordErrorMessage.style.display = 'block';
                    console.error('비밀번호 변경 실패:', response.status, errorData);
                }
            } catch (error) {
                changePasswordErrorMessage.textContent = '비밀번호 변경 요청 중 오류 발생. 네트워크 연결을 확인해주세요.';
                changePasswordErrorMessage.style.display = 'block';
                console.error('비밀번호 변경 요청 오류:', error);
            }
        });
