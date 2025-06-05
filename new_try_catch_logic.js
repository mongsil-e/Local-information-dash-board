    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ employeeId: employeeId, password: password }),
        });

        if (response.ok) {
            const data = await response.json();
            if (data.mustChangePassword === true) {
                // Correctly hide loginForm, show changePasswordForm
                errorMessage.textContent = data.message || '비밀번호 변경이 필요합니다.';
                errorMessage.style.display = 'block';
                loginForm.style.display = 'none';
                changePasswordForm.style.display = 'block';
                changePasswordEmployeeIdInput.value = employeeId;
                currentPasswordInput.focus();
            } else {
                window.location.replace('/'); // Normal login success
            }
        } else {
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
