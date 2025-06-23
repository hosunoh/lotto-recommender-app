// --- Firebase 설정 ---
// __firebase_config 및 __app_id는 Canvas 환경에서 자동으로 제공됩니다.
// 로컬 테스트를 위해 실제 Firebase 프로젝트 정보를 여기에 입력해야 합니다.
// Firebase 콘솔 > 프로젝트 설정 (톱니바퀴) > '내 앱' 섹션의 웹 앱에서 'config' 객체를 복사하여 붙여넣으세요.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyDQZHgkxZ7VIL7rsX-ILqQsG894brhzMSE", // 실제 Firebase API 키
    authDomain: "lucky-vicky-lotto-app.firebaseapp.com", // 실제 프로젝트 ID
    projectId: "lucky-vicky-lotto-app", // 실제 프로젝트 ID
    storageBucket: "lucky-vicky-lotto-app.appspot.com", // 실제 프로젝트 ID
    messagingSenderId: "295635715305", // 실제 메시징 센더 ID
    appId: "1:295635715305:web:bda03736f58a0f07a4dc78" // 실제 앱 ID
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Cloud Functions 트리거 URL (로또 번호 생성 API)
const CLOUD_FUNCTION_URL = "https://us-central1-lucky-vicky-lotto-app.cloudfunctions.net/get-lotto-numbers"; // 여기에 실제 Cloud Function URL을 입력하세요!

// --- 전역 Firebase 인스턴스 및 상태 변수 ---
let app;
let auth;
let db;
let currentUser = null; // 현재 로그인된 사용자 정보 (firebase.User 객체)
let userId = null;      // 현재 사용자 ID (uid)
let isAuthReady = false; // Firebase 인증 초기화 완료 여부

const ADMIN_EMAIL = 'oh.hosun@gmail.com'; // 관리자 이메일 설정

// --- 대시보드에서 사용될 데이터 변수 ---
let userRecommendedNumbers = []; // 사용자의 추천 번호 목록 (Firestore onSnapshot으로 업데이트됨)
let latestDrawDetails = null;    // 최신 로또 당첨 정보 (Firestore onSnapshot으로 업데이트됨)
let allUserRecommendations = []; // 관리자 페이지에서 모든 사용자 추천 번호 목록

// --- 공통 UI 요소 및 헬퍼 함수 ---

// 메시지 박스 표시 함수 (alert 대신 사용)
function showMessage(msg, type, duration = 3000, onClose = null) {
    let msgBox = document.getElementById('messageBox');
    if (!msgBox) {
        msgBox = document.createElement('div');
        msgBox.id = 'messageBox';
        msgBox.classList.add('message-box'); // style.css에 정의된 기본 스타일
        document.body.appendChild(msgBox);
    }
    msgBox.textContent = msg;
    // 타입에 따라 배경색 클래스 추가 (style.css에서 정의된 색상)
    msgBox.className = 'message-box ' +
        (type === 'error' ? 'bg-red-500' :
            type === 'success' ? 'bg-green-500' :
                type === 'info' ? 'bg-blue-500' :
                    'bg-gray-500');
    msgBox.classList.remove('hidden'); // hidden 클래스 제거하여 표시

    // 닫기 버튼 추가
    if (onClose) {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '닫기';
        closeBtn.classList.add('close-btn');
        closeBtn.onclick = () => {
            msgBox.classList.add('hidden');
            if (typeof onClose === 'function') onClose(); // 콜백 함수 호출
        };
        msgBox.appendChild(closeBtn);
    } else {
        // 지정된 시간 후 자동으로 메시지 숨김
        setTimeout(() => {
            msgBox.classList.add('hidden');
        }, duration);
    }
}

// 로딩 스피너 표시 함수
function showSpinner(element) {
    // 이미 스피너가 있는지 확인하여 중복 추가 방지
    if (element.querySelector('.spinner')) return;
    const spinner = document.createElement('div');
    spinner.classList.add('spinner'); // style.css에 정의된 spinner 클래스 사용
    element.appendChild(spinner);
}

// 로딩 스피너 숨김 함수
function hideSpinner(element) {
    const spinner = element.querySelector('.spinner');
    if (spinner) {
        spinner.remove();
    }
}

// --- Firebase 초기화 및 인증 상태 리스너 ---
async function initializeFirebase() {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    // Firebase 인증 상태 변화 감지
    auth.onAuthStateChanged(async (user) => {
        currentUser = user; // 현재 사용자 정보 업데이트
        userId = user ? user.uid : null; // 사용자 ID 업데이트

        if (user) {
            // 사용자 프로필 정보 확인 및 생성 (닉네임 포함)
            // private data: /artifacts/{appId}/users/{userId}/profile/info
            const userDocRef = db.collection(`artifacts/${appId}/users/${user.uid}/profile`).doc('info');
            const userDocSnap = await userDocRef.get();

            if (!userDocSnap.exists) {
                // 이메일 앞부분을 기본 닉네임으로 사용
                const defaultNickname = user.email ? user.email.split('@')[0] : '사용자';
                await userDocRef.set({
                    email: user.email,
                    nickname: defaultNickname,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp() // 서버 타임스탬프 사용
                });
            }
        }
        isAuthReady = true; // 인증 초기화 완료
        renderPageContent(); // 현재 페이지에 맞는 UI 렌더링 시작
        console.log("Firebase 인증 상태 변경 감지됨:", currentUser ? currentUser.email : "로그아웃됨");
    });

    // Canvas 환경에서 제공되는 초기 커스텀 토큰 처리
    // 익명 로그인 또는 커스텀 토큰 로그인 시도
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
            await auth.signInWithCustomToken(__initial_auth_token);
            console.log("Canvas에서 제공된 Custom token으로 로그인했습니다.");
        } catch (error) {
            console.error("Custom token으로 로그인 중 오류 발생:", error);
            try {
                await auth.signInAnonymously(); // 커스텀 토큰 실패 시 익명 로그인 시도
                console.log("Custom token 실패 후 익명으로 로그인했습니다.");
            } catch (err) {
                console.error("익명 로그인 중 오류 발생:", err);
            }
        }
    } else if (!auth.currentUser) {
        try {
            await auth.signInAnonymously(); // Canvas 토큰이 없으면 익명 로그인 시도
            console.log("Custom token이 없으므로 익명으로 로그인했습니다.");
        } catch (err) {
            console.error("익명 로그인 중 오류 발생:", err);
        }
    }
}

// --- 회원가입 함수 (member.html에서 호출) ---
async function handleSignup(email, password, nickname, submitBtn) {
    submitBtn.disabled = true;
    showSpinner(submitBtn);

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        // 회원가입 시 닉네임 저장
        await db.collection(`artifacts/${appId}/users/${userCredential.user.uid}/profile`).doc('info').set({
            email: userCredential.user.email,
            nickname: nickname,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage('회원 가입 성공! 이제 로그인 해주세요.', 'success', 3000, () => {
            window.location.href = 'login.html'; // 가입 성공 후 로그인 페이지로 이동
        });
    } catch (error) {
        console.error("회원가입 오류:", error);
        showMessage(`회원가입 실패: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        hideSpinner(submitBtn);
    }
}

// --- 로그인 함수 (login.html에서 호출) ---
async function handleLogin(email, password, submitBtn) {
    submitBtn.disabled = true;
    showSpinner(submitBtn);

    try {
        await auth.signInWithEmailAndPassword(email, password);
        showMessage('로그인 성공!', 'success', 3000, () => {
            window.location.href = 'dashboard.html'; // 로그인 성공 후 대시보드 페이지로 이동
        });
    } catch (error) {
        console.error("로그인 오류:", error);
        showMessage(`로그인 실패: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        hideSpinner(submitBtn);
    }
}

// --- 로그아웃 함수 (index.html 및 dashboard.html에서 호출) ---
async function handleLogout() {
    try {
        await auth.signOut();
        showMessage('로그아웃 성공!', 'success', 3000, () => {
            window.location.href = 'index.html'; // 로그아웃 후 메인 페이지로 이동
        });
    } catch (error) {
        console.error("로그아웃 오류:", error);
        showMessage(`로그아웃 실패: ${error.message}`, 'error');
    }
}


// --- UI 렌더링 및 데이터 로딩 로직 (페이지별 분기) ---
function renderPageContent() {
    const path = window.location.pathname;
    const appRoot = document.getElementById('app'); // dashboard.html의 주 컨테이너

    if (!isAuthReady) {
        // Firebase 인증이 준비되지 않았으면 로딩 스피너만 표시
        if (appRoot && path.includes('dashboard.html')) { // dashboard.html인 경우에만 로딩 표시
            appRoot.innerHTML = `
                <div class="container text-white flex flex-col justify-center items-center p-8">
                    <div class="spinner"></div>
                    <p class="text-xl mt-4">데이터 로딩 중...</p>
                </div>
            `;
        }
        return;
    }

    // --- index.html (메인 페이지) 로직 ---
    if (path.includes('index.html') || path === '/') {
        // index.html은 기존의 고정된 구조를 사용하고, JS만 붙는 형태
        // 여기서는 인증 상태에 따른 버튼만 변경
        const authButtonsDiv = document.querySelector('.auth-buttons');
        if (authButtonsDiv) {
            if (currentUser && !currentUser.isAnonymous) { // 로그인된 사용자이고 익명 사용자가 아님
                authButtonsDiv.innerHTML = `<a href="dashboard.html" class="auth-button">내 대시보드</a><button id="logoutBtn" class="auth-button bg-red-600 hover:bg-red-700">로그아웃</button>`;
                document.getElementById('logoutBtn').addEventListener('click', handleLogout);
            } else {
                authButtonsDiv.innerHTML = `<a href="member.html" class="auth-button">회원 가입</a><a href="login.html" class="auth-button">로그인</a>`;
            }
        }
        // index.html의 로또 추천 기능 초기화 (기존 script.js의 initializeApp 역할)
        initializeIndexPageLogic(); // 아래에 별도 함수로 분리
    }
    // --- login.html (로그인 페이지) 로직 ---
    else if (path.includes('login.html')) {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const loginSubmitBtn = document.getElementById('loginSubmitBtn');
                handleLogin(email, password, loginSubmitBtn);
            });
        }
    }
    // --- member.html (회원가입 페이지) 로직 ---
    else if (path.includes('member.html')) {
        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const nickname = document.getElementById('nickname').value;
                const signupSubmitBtn = document.getElementById('signupSubmitBtn');
                handleSignup(email, password, nickname, signupSubmitBtn);
            });
        }
    }
    // --- dashboard.html (대시보드 페이지) 로직 ---
    else if (path.includes('dashboard.html')) {
        if (!currentUser || currentUser.isAnonymous) { // 로그인되지 않았거나 익명 사용자이면 로그인 페이지로 리디렉션
            showMessage('로그인이 필요합니다.', 'warning', 3000, () => {
                window.location.href = 'login.html';
            });
            return;
        }

        // 로그인된 사용자라면 대시보드 렌더링
        if (currentUser.email === ADMIN_EMAIL) {
            renderAdminDashboard(); // 관리자 대시보드 렌더링
        } else {
            renderUserDashboard(); // 일반 사용자 대시보드 렌더링
        }
    }
}


// --- index.html 관련 로직 함수들 (기존 script.js에서 이동) ---
function initializeIndexPageLogic() {
    // index.html의 DOM 요소들을 다시 가져옴 (DOMContentLoaded 시점에 DOM이 준비되어 있으므로)
    const latestDrawNumSpan = document.getElementById('latestDrawNum');
    const nextDrawDateSpan = document.getElementById('nextDrawDate');
    const nextDrawNumSpan = document.getElementById('nextDrawNum');
    const viewDrawDetailsBtn = document.getElementById('viewDrawDetails');
    const latestDrawDetailsSection = document.getElementById('latestDrawDetailsSection');
    const displayedDrawNumSpan = document.getElementById('displayedDrawNum');
    const hideDrawDetailsBtn = document.getElementById('hideDrawDetails');
    const statisticalTabBtn = document.getElementById('statisticalTabBtn');
    const mlTabBtn = document.getElementById('mlTabBtn');
    const tabButtons = document.querySelectorAll('.tab-button');
    const generateBtn = document.getElementById('generateBtn');
    const numSetsSelect = document.getElementById('numSets');
    const lottoNumbersDisplay = document.getElementById('lottoNumbersDisplay');
    const messageElement = document.getElementById('message');

    let currentModelType = 'statistical';
    let cachedLatestDrawDetails = null; // API에서 가져온 최신 당첨 상세 정보를 저장할 변수

    // 내부 함수들을 클로저로 정의하거나, 전역에서 접근 가능하도록 조정
    async function displayNextDrawDateAndNumber() {
        const today = new Date();
        const currentDayOfWeek = today.getDay();
        let daysUntilSaturday;
        if (currentDayOfWeek === 6) { daysUntilSaturday = 7; } else { daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7; if (daysUntilSaturday === 0) { daysUntilSaturday = 7; } }
        const nextSaturday = new Date(today);
        nextSaturday.setDate(today.getDate() + daysUntilSaturday);
        const year = nextSaturday.getFullYear();
        const month = nextSaturday.getMonth() + 1;
        const day = nextSaturday.getDate();
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = dayNames[nextSaturday.getDay()];
        if (nextDrawDateSpan) nextDrawDateSpan.textContent = `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;

        try {
            // index.html은 로그인 없이도 최신 당첨 번호를 보여줘야 하므로, API를 직접 호출합니다.
            // num_sets를 1로 지정하여 한 세트만 요청하고, model_type은 통계 기반으로 고정합니다.
            const response = await fetch(`${CLOUD_FUNCTION_URL}?model_type=statistical&num_sets=1`, { method: 'GET' });
            if (!response.ok) { const errorText = await response.text(); throw new Error(`API 오류: ${response.status} ${response.statusText} - ${errorText}`); }
            const data = await response.json();
            if (data.latest_draw_number !== undefined) {
                if (latestDrawNumSpan) latestDrawNumSpan.textContent = `${data.latest_draw_number}회`;
                if (nextDrawNumSpan) nextDrawNumSpan.textContent = `${data.latest_draw_number + 1}회`;
                cachedLatestDrawDetails = data.latest_draw_details;
            } else {
                if (latestDrawNumSpan) latestDrawNumSpan.textContent = '정보 없음';
                if (nextDrawNumSpan) nextDrawNumSpan.textContent = '계산 불가';
            }
        } catch (error) {
            console.error("최신 회차 정보 로딩 오류:", error);
            if (latestDrawNumSpan) latestDrawNumSpan.textContent = '오류 발생';
            if (nextDrawNumSpan) nextDrawNumSpan.textContent = '오류 발생';
        }
    }

    function displayLatestDrawDetails() {
        if (!cachedLatestDrawDetails) {
            showMessage('최신 당첨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'warning');
            return;
        }
        if (displayedDrawNumSpan) displayedDrawNumSpan.textContent = (latestDrawNumSpan ? latestDrawNumSpan.textContent.replace('회', '') : 'N/A');
        const details = cachedLatestDrawDetails;
        const mainNumbersDiv = latestDrawDetailsSection.querySelector('.main-numbers');
        if (mainNumbersDiv) mainNumbersDiv.innerHTML = '';
        details.winning_numbers.forEach(num => {
            const numSpan = document.createElement('span');
            numSpan.classList.add('lotto-number');
            // 번호별 색상 팔레트 적용 (style.css에 추가 필요)
            numSpan.classList.add(`bg-num-${Math.ceil(num / 10)}`); // 1-10: num-1, 11-20: num-2 등
            if (num === details.bonus_number) { // 보너스 번호는 별도 색상 (이미 보너스 번호는 따로 표시하고 있지만, 중복될 경우 대비)
                numSpan.classList.add('bg-num-bonus');
            }
            numSpan.textContent = num;
            if (mainNumbersDiv) mainNumbersDiv.appendChild(numSpan);
        });
        const bonusNumSpan = latestDrawDetailsSection.querySelector('.bonus-num');
        if (bonusNumSpan) {
            bonusNumSpan.textContent = details.bonus_number;
            bonusNumSpan.classList.add(`bg-num-bonus`); // 보너스 번호 색상 적용
        }
        const prizeInfoGrid = latestDrawDetailsSection.querySelector('.prize-info-grid');
        if (prizeInfoGrid) prizeInfoGrid.innerHTML = '';
        const rankNames = { "1st": "1등", "2nd": "2등", "3rd": "3등", "4th": "4등", "5th": "5등" };
        for (const rank in details.prizes) {
            if (details.prizes.hasOwnProperty(rank) && details.prizes[rank] !== null) {
                const prizeItem = document.createElement('div');
                prizeItem.classList.add('prize-item');
                prizeItem.innerHTML = `<span>${rankNames[rank]}</span> <span>${details.prizes[rank].toLocaleString()}원</span>`;
                if (prizeInfoGrid) prizeInfoGrid.appendChild(prizeItem);
            }
        }
        if (latestDrawDetailsSection) latestDrawDetailsSection.classList.remove('hidden');
    }

    function switchModelType(event) {
        const selectedButton = event.target;
        currentModelType = selectedButton.dataset.modelType;
        tabButtons.forEach(button => button.classList.remove('active'));
        selectedButton.classList.add('active');
        if (messageElement) messageElement.classList.add('hidden'); // 메시지 숨김
        if (numSetsSelect) numSetsSelect.value = "1";
    }

    async function generateLottoNumbers() {
        const numSets = parseInt(numSetsSelect.value);
        if (lottoNumbersDisplay) lottoNumbersDisplay.innerHTML = '';
        if (messageElement) messageElement.classList.add('hidden');

        showMessage('로또 번호 생성 중입니다...', 'info');
        if (lottoNumbersDisplay) lottoNumbersDisplay.innerHTML = '<div class="spinner"></div>';

        let hasError = false;

        try {
            // index.html의 로또 번호 생성은 Firebase에 저장하지 않고 단순히 표시
            const apiUrl = `${CLOUD_FUNCTION_URL}?model_type=${currentModelType}&num_sets=${numSets}`;
            const response = await fetch(apiUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' }, });

            if (!response.ok) {
                let errorData = {};
                try { errorData = await response.json(); } catch (jsonError) { errorData.error = await response.text(); }
                throw new Error(`API 오류: ${response.status} ${response.statusText} - ${errorData.error || '알 수 없는 오류'}`);
            }

            const data = await response.json();
            if (data.lotto_numbers && Array.isArray(data.lotto_numbers)) {
                data.lotto_numbers.forEach((lottoSetData, indexInResponse) => {
                    if (lottoSetData && Array.isArray(lottoSetData.numbers)) {
                        const modelLabel = currentModelType === 'statistical' ? '통계 기반 추천' : 'ML 기반 추천';
                        // index.html에서는 과거 적중률을 표시하지 않으므로 historicalHitRates는 넘기지 않음
                        displayLottoSet(lottoSetData.numbers.sort((a, b) => a - b), indexInResponse + 1, modelLabel, null);
                    } else {
                        console.error("잘못된 로또 세트 데이터 수신 (API):", lottoSetData);
                        showMessage('API에서 잘못된 로또 번호 세트를 받았습니다. 콘솔을 확인해주세요.', 'error');
                        hasError = true;
                    }
                });
                if (!hasError) { showMessage('로또 추천 번호가 생성되었습니다!', 'success'); }
            } else {
                throw new Error("API에서 올바른 로또 번호 형식을 받지 못했습니다.");
            }
        } catch (error) {
            console.error("로또 번호 생성 중 오류 발생:", error);
            showMessage(`번호 생성에 실패했습니다: ${error.message}`, 'error');
            hasError = true;
        } finally {
            const spinnerDiv = lottoNumbersDisplay.querySelector('.spinner');
            if (spinnerDiv) spinnerDiv.remove();
        }
    }

    // index.html에서 로또 번호 세트를 UI에 표시하는 함수 (historicalHitRates는 무시)
    function displayLottoSet(numbers, setIndex, modelLabel) { // historicalHitRates 인자 제거
        const card = document.createElement('div');
        card.classList.add('lotto-set-card');

        const title = document.createElement('h3');
        title.textContent = `[${modelLabel}] 추천 번호 #${setIndex}`;
        card.appendChild(title);

        const numbersDiv = document.createElement('div');
        numbersDiv.classList.add('lotto-numbers');
        numbers.forEach(num => {
            const numSpan = document.createElement('span');
            numSpan.classList.add('lotto-number');
            // 번호별 색상 팔레트 적용 (style.css에 추가 필요)
            numSpan.classList.add(`bg-num-${Math.ceil(num / 10)}`);
            numSpan.textContent = num;
            numbersDiv.appendChild(numSpan);
        });
        card.appendChild(numbersDiv);

        // index.html에서는 과거 적중률을 표시하지 않음
        // const hitRate = document.createElement('p');
        // hitRate.classList.add('hit-rate');
        // hitRate.textContent = `(지난 회차 적중률: 계산 예정)`;
        // card.appendChild(hitRate);

        if (lottoNumbersDisplay) lottoNumbersDisplay.appendChild(card);
    }

    // --- Event Listeners for index.html ---
    if (generateBtn) generateBtn.addEventListener('click', generateLottoNumbers);
    if (viewDrawDetailsBtn) viewDrawDetailsBtn.addEventListener('click', (e) => { e.preventDefault(); displayLatestDrawDetails(); });
    if (hideDrawDetailsBtn) hideDrawDetailsBtn.addEventListener('click', () => { latestDrawDetailsSection.classList.add('hidden'); });
    if (statisticalTabBtn) statisticalTabBtn.addEventListener('click', switchModelType);
    if (mlTabBtn) mlTabBtn.addEventListener('click', switchModelType);

    displayNextDrawDateAndNumber(); // 초기 로딩 시 최신 정보 가져오기
    tabButtons.forEach(button => { // 초기 탭 활성화
        if (button.dataset.modelType === currentModelType) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
} // <--- 이 닫는 중괄호가 이전 버전에서 누락되었을 수 있습니다.

// --- 사용자 대시보드 렌더링 함수 ---
async function renderUserDashboard() {
    const appRoot = document.getElementById('app');
    if (!appRoot) return;

    appRoot.className = "w-full flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-800 to-purple-900 p-4 font-inter"; // 사용자 대시보드 배경

    // 대시보드 HTML 구조 생성
    appRoot.innerHTML = `
        <div class="container text-white">
            <h2 class="text-4xl font-extrabold text-center mb-8">사용자 대시보드</h2>
            <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
                <p class="text-lg">환영합니다, ${currentUser?.email || 'User'}! (${userId.substring(0, 8)}...)</p>
                <button id="logoutBtn" class="px-6 py-2 bg-red-600 rounded-md hover:bg-red-700 transition-colors shadow-lg">
                    로그아웃
                </button>
            </div>

            <div id="userMessage" class="hidden text-center p-3 my-4 rounded-md font-semibold"></div>
            
            <!-- 새 로또 번호 생성 섹션 -->
            <div class="bg-white bg-opacity-10 p-6 rounded-lg shadow-xl mb-8">
                <h3 class="text-2xl font-semibold mb-4">새 로또 번호 생성</h3>
                <div class="flex flex-col sm:flex-row gap-4 items-center justify-center">
                    <select
                        id="numSetsDashboard"
                        class="px-4 py-2 rounded-md bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
                    >
                        <option value="1">1 세트</option>
                        <option value="2">2 세트</option>
                        <option value="3">3 세트</option>
                        <option value="4">4 세트</option>
                        <option value="5">5 세트</option>
                    </select>
                    <button
                        id="generateStatBtnDashboard"
                        class="px-6 py-3 bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors shadow-lg flex-grow sm:flex-grow-0 w-full sm:w-auto"
                    >
                        통계 기반 생성
                    </button>
                    <button
                        id="generateKMeansBtnDashboard"
                        class="px-6 py-3 bg-purple-600 rounded-md hover:bg-purple-700 transition-colors shadow-lg flex-grow sm:flex-grow-0 w-full sm:w-auto"
                    >
                        ML 기반 생성 (K-Means)
                    </button>
                </div>
            </div>

            <!-- 최신 로또 추첨 정보 -->
            <div class="bg-white bg-opacity-10 p-6 rounded-lg shadow-xl mb-8">
                <h3 class="text-2xl font-semibold mb-4">최신 로또 추첨 정보</h3>
                <div id="latestDrawDetailsContentDashboard">
                    <!-- Details will be rendered here by renderLatestDrawDetailsDashboard -->
                    <p>최신 추첨 정보를 불러오는 중...</p>
                </div>
            </div>

            <!-- 나의 추천 번호 -->
            <div class="bg-white bg-opacity-10 p-6 rounded-lg shadow-xl">
                <h3 class="text-2xl font-semibold mb-4">나의 추천 번호</h3>
                <div id="recommendedNumbersDisplayDashboard" class="space-y-4">
                    <!-- Recommended numbers will be rendered here by renderUserRecommendedNumbers -->
                    <p>추천 번호가 아직 없습니다. 생성해 보세요!</p>
                </div>
            </div>
        </div>
    `;

    // 이벤트 리스너 연결
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    document.getElementById('generateStatBtnDashboard').addEventListener('click', () => {
        const numSets = parseInt(document.getElementById('numSetsDashboard').value);
        generateLottoNumbersDashboard('statistical', numSets);
    });

    document.getElementById('generateKMeansBtnDashboard').addEventListener('click', () => {
        const numSets = parseInt(document.getElementById('numSetsDashboard').value);
        generateLottoNumbersDashboard('kmeans', numSets);
    });

    // 데이터 로드 및 UI 업데이트 시작
    fetchUserRecommendedNumbers(); // 사용자의 추천 번호 실시간 로드 시작
    fetchLatestDrawDetailsDashboard(); // 최신 추첨 정보 실시간 로드 시작
}

// 사용자 추천 번호 Firestore에서 실시간 로드 (onSnapshot 사용)
async function fetchUserRecommendedNumbers() {
    if (!userId) return; // 사용자 ID가 없으면 함수 종료

    // private data: /artifacts/{appId}/users/{userId}/recommendedNumbers
    const q = db.collection(`artifacts/${appId}/users/${userId}/recommendedNumbers`);

    q.onSnapshot((querySnapshot) => {
        const numbers = [];
        querySnapshot.forEach((doc) => {
            numbers.push({ id: doc.id, ...doc.data() });
        });
        // 시간 역순으로 정렬 (최신 번호가 위에 오도록)
        numbers.sort((a, b) => {
            const dateA = a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(0);
            const dateB = b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate() : new Date(0);
            return dateB - dateA;
        });
        userRecommendedNumbers = numbers; // 전역 변수 업데이트
        renderUserRecommendedNumbers(); // UI 업데이트
    }, (error) => {
        console.error("사용자 추천 번호 로딩 오류 (onSnapshot):", error);
        showMessage(`내 추천 번호를 불러오는데 실패했습니다: ${error.message}`, 'error');
    });
}

// 대시보드의 최신 추첨 정보 로드 (onSnapshot 사용)
async function fetchLatestDrawDetailsDashboard() {
    // public data: /artifacts/{appId}/public/data/lottoDraws
    const lottoDrawsRef = db.collection(`artifacts/${appId}/public/data/lottoDraws`);
    // orderBy를 사용할 수 없으므로, 모든 문서를 가져와 클라이언트에서 최신 회차를 찾습니다.

    lottoDrawsRef.onSnapshot((querySnapshot) => {
        let latestDraw = null;
        let latestDrawNum = 0;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const currentDrawNum = parseInt(doc.id); // 문서 ID가 회차 번호라고 가정
            if (!isNaN(currentDrawNum) && currentDrawNum > latestDrawNum) {
                latestDrawNum = currentDrawNum;
                latestDraw = { ...data, drawNumber: currentDrawNum };
            }
        });

        latestDrawDetails = latestDraw; // 전역 변수 업데이트
        renderLatestDrawDetailsDashboard(); // UI 업데이트
    }, (error) => {
        console.error("최신 추첨 정보 로딩 오류 (onSnapshot):", error);
        showMessage(`최신 추첨 정보를 불러오는데 실패했습니다: ${error.message}`, 'error');
    });
}

// 사용자 대시보드 - 나의 추천 번호 섹션 렌더링
function renderUserRecommendedNumbers() {
    const recommendedNumbersDisplay = document.getElementById('recommendedNumbersDisplayDashboard');
    if (!recommendedNumbersDisplay) return;

    if (userRecommendedNumbers.length > 0) {
        recommendedNumbersDisplay.innerHTML = ''; // 기존 내용 초기화
        userRecommendedNumbers.forEach((set) => {
            const card = document.createElement('div');
            card.classList.add('bg-gray-700', 'bg-opacity-30', 'p-4', 'rounded-lg', 'shadow', 'flex', 'flex-col', 'items-center', 'space-y-2');

            const drawInfo = document.createElement('p');
            drawInfo.classList.add('text-lg', 'font-semibold');
            drawInfo.textContent = `회차 번호: ${set.drawNumber || 'N/A'} - ${set.modelType === 'statistical' ? '통계 기반' : 'ML 기반'} 추천`;
            card.appendChild(drawInfo);

            const numbersDiv = document.createElement('div');
            numbersDiv.classList.add('flex', 'flex-wrap', 'gap-2', 'justify-center'); // 번호 가운데 정렬
            set.numbers?.forEach(num => {
                const numSpan = document.createElement('span');
                numSpan.classList.add('lotto-number-circle', 'bg-blue-500'); // 통계/ML 추천 번호는 파란색
                numSpan.textContent = num;
                numbersDiv.appendChild(numSpan);
            });
            card.appendChild(numbersDiv);

            if (latestDrawDetails && latestDrawDetails.winning_numbers && latestDrawDetails.bonus_number) {
                const matchRateP = document.createElement('p');
                matchRateP.classList.add('text-sm', 'text-yellow-200');
                matchRateP.innerHTML = `최신 추첨 (${latestDrawDetails.drawNumber}회) 매치: <span class="font-bold">${calculateMatchRate(set.numbers, latestDrawDetails.winning_numbers, latestDrawDetails.bonus_number)}</span>`;
                card.appendChild(matchRateP);
            }

            if (set.historicalHitRates && Object.keys(set.historicalHitRates).length > 0) {
                const hitRatesP = document.createElement('p');
                hitRatesP.classList.add('text-sm', 'text-gray-300');
                const filteredHitRates = Object.entries(set.historicalHitRates).filter(([, count]) => count > 0);
                if (filteredHitRates.length > 0) {
                    hitRatesP.innerHTML = `과거 매치: ${filteredHitRates.map(([rank, count]) => `<span class="mr-1">${count} (${rank})</span>`).join(', ')}`;
                } else {
                    hitRatesP.textContent = '과거 매치: 없음 (3~5등 기준)';
                }
                card.appendChild(hitRatesP);
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '삭제';
            deleteBtn.classList.add('mt-2', 'px-4', 'py-2', 'bg-red-500', 'text-white', 'rounded-md', 'hover:bg-red-600', 'transition-colors');
            deleteBtn.onclick = () => deleteRecommendedNumber(set.id);
            card.appendChild(deleteBtn);

            recommendedNumbersDisplay.appendChild(card);
        });
    } else {
        recommendedNumbersDisplay.innerHTML = '<p class="text-gray-400">추천 번호가 아직 없습니다. 생성해 보세요!</p>';
    }
}

// 사용자 대시보드 - 최신 로또 추첨 정보 섹션 렌더링
function renderLatestDrawDetailsDashboard() {
    const latestDrawDetailsContent = document.getElementById('latestDrawDetailsContentDashboard');
    if (!latestDrawDetailsContent) return;

    if (latestDrawDetails) {
        let prizeDetailsHtml = '';
        if (latestDrawDetails.prizes) {
            const rankNames = { "1st": "1등", "2nd": "2등", "3rd": "3등", "4th": "4등", "5th": "5등" };
            for (const rank in latestDrawDetails.prizes) {
                if (latestDrawDetails.prizes.hasOwnProperty(rank) && latestDrawDetails.prizes[rank] !== null) {
                    const formattedPrize = typeof latestDrawDetails.prizes[rank] === 'number'
                        ? latestDrawDetails.prizes[rank].toLocaleString('ko-KR') + '원'
                        : latestDrawDetails.prizes[rank]; // 숫자가 아니면 그대로 표시
                    prizeDetailsHtml += `
                        <div class="bg-gray-700 bg-opacity-30 p-3 rounded-md flex justify-between items-center text-sm">
                            <span class="font-semibold">${rankNames[rank]} 상금:</span> <span>${formattedPrize}</span>
                        </div>
                    `;
                }
            }
        }

        latestDrawDetailsContent.innerHTML = `
            <p class="text-lg mb-2">회차 번호: ${latestDrawDetails.drawNumber || 'N/A'}</p>
            <p class="text-lg mb-2">당첨 번호:</p>
            <div class="flex flex-wrap gap-2 mt-2 justify-center">
                ${latestDrawDetails.winning_numbers?.map((num) => `<span class="lotto-number-circle bg-green-500">${num}</span>`).join('')}
                <span class="lotto-number-circle bg-yellow-500 border-2 border-yellow-300">
                    + ${latestDrawDetails.bonus_number} (보너스)
                </span>
            </div>
            <button id="showDrawDetailsToggleDashboard" class="mt-4 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-md">
                당첨금 상세 보기
            </button>
            <div id="prizeDetailsSectionDashboard" class="mt-4 border-t border-gray-600 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 hidden">
                ${prizeDetailsHtml || '<p class="text-center text-gray-400">당첨금 정보 없음</p>'}
            </div>
        `;
        document.getElementById('showDrawDetailsToggleDashboard').addEventListener('click', () => {
            const prizeDetailsSection = document.getElementById('prizeDetailsSectionDashboard');
            prizeDetailsSection.classList.toggle('hidden');
            document.getElementById('showDrawDetailsToggleDashboard').textContent =
                prizeDetailsSection.classList.contains('hidden') ? '당첨금 상세 보기' : '당첨금 숨기기';
        });
    } else {
        latestDrawDetailsContent.innerHTML = '<p class="text-gray-400">최신 추첨 정보를 불러오지 못했습니다.</p>';
    }
}

// 추천 번호 삭제 함수
async function deleteRecommendedNumber(docId) {
    if (!userId) {
        showMessage('로그인이 필요합니다.', 'warning');
        return;
    }
    showMessage('번호를 삭제 중입니다...', 'info');
    try {
        await db.collection(`artifacts/${appId}/users/${userId}/recommendedNumbers`).doc(docId).delete();
        showMessage('번호가 성공적으로 삭제되었습니다.', 'success');
        // onSnapshot에 의해 자동으로 UI가 업데이트될 것임
    } catch (error) {
        console.error("추천 번호 삭제 오류:", error);
        showMessage(`번호 삭제 실패: ${error.message}`, 'error');
    }
}

// 로또 번호 생성 및 Firestore에 저장 (대시보드 전용)
async function generateLottoNumbersDashboard(modelType, numSets) {
    if (!userId) {
        showMessage('번호를 생성하려면 로그인해야 합니다.', 'warning');
        return;
    }
    const generateBtnStat = document.getElementById('generateStatBtnDashboard');
    const generateBtnKMeans = document.getElementById('generateKMeansBtnDashboard');

    if (generateBtnStat) generateBtnStat.disabled = true;
    if (generateBtnKMeans) generateBtnKMeans.disabled = true;

    // 스피너는 생성 버튼 바로 옆에 추가
    showSpinner(generateBtnStat || generateBtnKMeans);
    showMessage('로또 번호 생성 중...', 'info');

    try {
        // num_sets 파라미터를 사용하여 한 번의 API 호출로 여러 세트 요청
        const apiUrl = `${CLOUD_FUNCTION_URL}?model_type=${modelType}&num_sets=${numSets}`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 오류: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();

        if (data.lotto_numbers && Array.isArray(data.lotto_numbers)) {
            // API가 여러 세트를 배열로 반환하므로 각 세트를 Firestore에 추가
            for (const lottoSetData of data.lotto_numbers) {
                if (lottoSetData && Array.isArray(lottoSetData.numbers)) {
                    const newNumberSet = {
                        drawNumber: data.latest_draw_number, // API에서 받은 최신 회차 번호 사용
                        numbers: lottoSetData.numbers.sort((a, b) => a - b),
                        historicalHitRates: lottoSetData.historical_hit_rates || {},
                        modelType: modelType,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp() // 서버 타임스탬프
                    };
                    await db.collection(`artifacts/${appId}/users/${userId}/recommendedNumbers`).add(newNumberSet);
                } else {
                    console.error("Malformed lotto set data from API:", lottoSetData);
                    showMessage('API에서 잘못된 데이터를 받았습니다. 다시 시도해주세요.', 'error');
                    return;
                }
            }
            showMessage('로또 번호가 생성되어 저장되었습니다!', 'success');
            // onSnapshot이 데이터를 자동으로 업데이트하므로 별도의 fetch 호출 필요 없음
        } else {
            throw new Error("API에서 올바른 로또 번호 형식을 받지 못했습니다.");
        }
    } catch (error) {
        console.error("로또 번호 생성 중 오류 발생:", error);
        showMessage(`번호 생성에 실패했습니다: ${error.message}`, 'error');
    } finally {
        if (generateBtnStat) generateBtnStat.disabled = false;
        if (generateBtnKMeans) generateBtnKMeans.disabled = false;
        hideSpinner(generateBtnStat || generateBtnKMeans);
    }
}

// 추천 번호와 당첨 번호의 일치 여부 계산
function calculateMatchRate(recommended, winning, bonus) {
    if (!recommended || !winning || !bonus) return 'N/A';
    const recommendedSet = new Set(recommended);
    const winningSet = new Set(winning);

    let matches = 0;
    for (const num of recommendedSet) {
        if (winningSet.has(num)) {
            matches++;
        }
    }

    const hasBonus = recommendedSet.has(bonus);

    if (matches === 6) return '1등 (6개 일치)';
    if (matches === 5 && hasBonus) return '2등 (5개 일치 + 보너스)';
    if (matches === 5) return '3등 (5개 일치)';
    if (matches === 4) return '4등 (4개 일치)';
    if (matches === 3) return '5등 (3개 일치)';
    return '등수 없음';
}


// --- 관리자 대시보드 렌더링 함수 ---
async function renderAdminDashboard() {
    const appRoot = document.getElementById('app');
    if (!appRoot) return;

    appRoot.className = "w-full flex justify-center items-center min-h-screen bg-admin-gradient p-4 font-inter"; // 관리자 대시보드 배경

    appRoot.innerHTML = `
        <div class="container text-white">
            <h2 class="text-4xl font-extrabold text-center mb-8">관리자 대시보드</h2>
            <div class="flex justify-end items-center mb-6">
                <button id="logoutBtn" class="px-6 py-2 bg-red-600 rounded-md hover:bg-red-700 transition-colors shadow-lg">
                    로그아웃
                </button>
            </div>
            <div id="adminMessageBox" class="hidden text-center p-3 my-4 rounded-md font-semibold"></div>
            
            <!-- 최신 로또 추첨 데이터 입력 섹션 -->
            <div class="admin-section mb-8">
                <h3 class="text-2xl font-semibold mb-4 text-gray-900">최신 로또 추첨 데이터 입력</h3>
                <form id="addLottoDrawForm" class="space-y-4 text-gray-900">
                    <div>
                        <label for="adminDrawNumber" class="block text-sm font-medium text-gray-200 mb-1">
                            회차 번호
                        </label>
                        <input
                            id="adminDrawNumber"
                            type="number"
                            required
                            class="w-full px-3 py-2 border rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="예: 1176"
                        />
                    </div>
                    <div>
                        <label for="adminWinningNumbers" class="block text-sm font-medium text-gray-200 mb-1">
                            당첨 번호 (쉼표로 구분, 오름차순)
                        </label>
                        <input
                            id="adminWinningNumbers"
                            type="text"
                            required
                            class="w-full px-3 py-2 border rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="예: 7,9,11,21,30,35"
                        />
                    </div>
                    <div>
                        <label for="adminBonusNumber" class="block text-sm font-medium text-gray-200 mb-1">
                            보너스 번호
                        </label>
                        <input
                            id="adminBonusNumber"
                            type="number"
                            required
                            class="w-full px-3 py-2 border rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder="예: 29"
                        />
                    </div>
                    <div>
                        <label for="adminPrizes" class="block text-sm font-medium text-gray-200 mb-1">
                            상금 (JSON 형식, 등수별 금액)
                        </label>
                        <textarea
                            id="adminPrizes"
                            rows="3"
                            required
                            class="w-full px-3 py-2 border rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder='{\\"1st\\": 49959102, \\"2nd\\": 1258523, \\"3rd\\": 50000, \\"4th\\": 5000, \\"5th\\": null}'
                        ></textarea>
                        <p class="text-xs text-gray-400 mt-1">
                            예시: \`{\\"1st\\": 1000000, \\"2nd\\": 500000, \\"3rd\\": 50000}\`
                        </p>
                    </div>
                    <div>
                        <button
                            type="submit"
                            id="adminAddLottoDrawBtn"
                            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            로또 추첨 데이터 추가
                        </button>
                    </div>
                </form>
            </div>

            <!-- 모든 사용자 추천 번호 섹션 -->
            <div class="admin-section">
                <h3 class="text-2xl font-semibold mb-4 text-gray-900">모든 사용자 추천 번호</h3>
                <div id="allUserRecommendationsDisplay" class="space-y-4">
                    <!-- All user recommendations will be rendered here by renderAllUserRecommendations -->
                    <p class="text-gray-400">사용자 추천 번호를 불러오는 중...</p>
                </div>
            </div>
        </div>
    `;

    // 이벤트 리스너 연결
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('addLottoDrawForm').addEventListener('submit', handleAddLottoDraw);

    // 데이터 로드 및 UI 업데이트 시작
    fetchAllUserRecommendations(); // 모든 사용자 추천 번호 로드 시작
}

// 모든 사용자 추천 번호 Firestore에서 로드 (getDocs 사용)
async function fetchAllUserRecommendations() {
    const adminMessageBox = document.getElementById('adminMessageBox');
    showSpinner(adminMessageBox || document.body); // 스피너 표시 (메시지 박스 또는 바디에)
    adminMessageBox.classList.add('hidden'); // 기존 메시지 숨김

    try {
        const usersCollectionRef = db.collection(`artifacts/${appId}/users`);
        const usersSnapshot = await usersCollectionRef.get(); // 모든 사용자 문서 가져오기
        const fetchedRecommendations = [];

        for (const userDoc of usersSnapshot.docs) {
            const currentUserId = userDoc.id;
            const userProfileRef = db.collection(`artifacts/${appId}/users/${currentUserId}/profile`).doc('info');
            const userProfileSnap = await userProfileRef.get();
            const nickname = userProfileSnap.exists ? userProfileSnap.data().nickname : `사용자 (${currentUserId.substring(0, 4)}...)`;

            const recommendationsCollectionRef = db.collection(`artifacts/${appId}/users/${currentUserId}/recommendedNumbers`);
            const recommendationsSnapshot = await recommendationsCollectionRef.get();

            recommendationsSnapshot.forEach(recDoc => {
                fetchedRecommendations.push({
                    id: recDoc.id,
                    userId: currentUserId,
                    nickname: nickname,
                    ...recDoc.data()
                });
            });
        }
        // 시간 역순으로 정렬 (최신 번호가 위에 오도록)
        fetchedRecommendations.sort((a, b) => {
            const dateA = a.timestamp && typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate() : new Date(0);
            const dateB = b.timestamp && typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate() : new Date(0);
            return dateB - dateA;
        });
        allUserRecommendations = fetchedRecommendations; // 전역 변수 업데이트
        renderAllUserRecommendations(); // UI 업데이트
        showMessage('모든 사용자 추천 번호가 로드되었습니다.', 'success'); // 관리자 메시지 박스에 표시
    } catch (error) {
        console.error("모든 사용자 추천 번호 로딩 오류:", error);
        showMessage(`모든 사용자 추천 번호를 불러오는데 실패했습니다: ${error.message}`, 'error');
    } finally {
        hideSpinner(adminMessageBox || document.body); // 스피너 숨김
    }
}

// 관리자 대시보드 - 모든 사용자 추천 번호 섹션 렌더링
function renderAllUserRecommendations() {
    const allUserRecommendationsDisplay = document.getElementById('allUserRecommendationsDisplay');
    if (!allUserRecommendationsDisplay) return;

    if (allUserRecommendations.length > 0) {
        allUserRecommendationsDisplay.innerHTML = ''; // 기존 내용 초기화
        allUserRecommendations.forEach((set) => {
            const card = document.createElement('div');
            card.classList.add('bg-gray-700', 'bg-opacity-30', 'p-4', 'rounded-lg', 'shadow', 'flex', 'flex-col', 'items-center', 'space-y-2');

            const userInfo = document.createElement('p');
            userInfo.classList.add('text-lg', 'font-semibold');
            userInfo.textContent = `사용자: ${set.nickname} (ID: ${set.userId.substring(0, 8)}...) - 회차 번호: ${set.drawNumber || 'N/A'} - ${set.modelType === 'statistical' ? '통계 기반' : 'ML 기반'} 추천`;
            card.appendChild(userInfo);

            const numbersDiv = document.createElement('div');
            numbersDiv.classList.add('flex', 'flex-wrap', 'gap-2', 'justify-center'); // 번호 가운데 정렬
            set.numbers?.forEach(num => {
                const numSpan = document.createElement('span');
                numSpan.classList.add('lotto-number-circle', 'bg-blue-500');
                numSpan.textContent = num;
                numbersDiv.appendChild(numSpan);
            });
            card.appendChild(numbersDiv);

            if (set.historicalHitRates && Object.keys(set.historicalHitRates).length > 0) {
                const hitRatesP = document.createElement('p');
                hitRatesP.classList.add('text-sm', 'text-gray-300');
                const filteredHitRates = Object.entries(set.historicalHitRates).filter(([, count]) => count > 0);
                if (filteredHitRates.length > 0) {
                    hitRatesP.innerHTML = `과거 매치: ${filteredHitRates.map(([rank, count]) => `<span class="mr-1">${count} (${rank})</span>`).join(', ')}`;
                } else {
                    hitRatesP.textContent = '과거 매치: 없음 (3~5등 기준)';
                }
                card.appendChild(hitRatesP);
            }
            allUserRecommendationsDisplay.appendChild(card);
        });
    } else {
        allUserRecommendationsDisplay.innerHTML = '<p class="text-gray-400">사용자 추천 번호가 없습니다.</p>';
    }
}

// 관리자 대시보드 - 로또 추첨 데이터 추가 처리
async function handleAddLottoDraw(e) {
    e.preventDefault();
    const drawNumberInput = document.getElementById('adminDrawNumber');
    const winningNumbersInput = document.getElementById('adminWinningNumbers');
    const bonusNumberInput = document.getElementById('adminBonusNumber');
    const prizesInput = document.getElementById('adminPrizes');
    const submitBtn = document.getElementById('adminAddLottoDrawBtn');
    const adminMessageBox = document.getElementById('adminMessageBox');

    submitBtn.disabled = true;
    showSpinner(submitBtn);
    adminMessageBox.classList.add('hidden'); // 이전 메시지 숨김

    try {
        const drawNumber = parseInt(drawNumberInput.value);
        const parsedWinningNumbers = winningNumbersInput.value.split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num));
        const parsedBonusNumber = parseInt(bonusNumberInput.value.trim());

        let parsedPrizes = {};
        try {
            parsedPrizes = JSON.parse(prizesInput.value);
        } catch (jsonError) {
            throw new Error('상금 입력이 유효한 JSON 형식이 아닙니다. `{"1st": 1000000, "2nd": 500000}` 형식을 사용하세요.');
        }

        if (isNaN(drawNumber) || parsedWinningNumbers.length !== 6 || isNaN(parsedBonusNumber)) {
            throw new Error('정확한 회차 번호, 6개의 당첨 번호, 그리고 보너스 번호를 올바르게 입력하세요.');
        }
        // 당첨 번호 오름차순 정렬 (API 일관성을 위해)
        parsedWinningNumbers.sort((a, b) => a - b);

        const drawData = {
            winning_numbers: parsedWinningNumbers,
            bonus_number: parsedBonusNumber,
            prizes: parsedPrizes,
            drawDate: firebase.firestore.FieldValue.serverTimestamp() // 서버 타임스탬프 사용
        };

        // public data: /artifacts/{appId}/public/data/lottoDraws/{drawNumber}
        await db.collection(`artifacts/${appId}/public/data/lottoDraws`).doc(String(drawNumber)).set(drawData);

        showMessage(`${drawNumber}회차 정보가 성공적으로 추가되었습니다!`, 'success');
        // 폼 초기화
        drawNumberInput.value = '';
        winningNumbersInput.value = '';
        bonusNumberInput.value = '';
        prizesInput.value = '';
    } catch (error) {
        console.error("로또 추첨 정보 추가 오류:", error);
        showMessage(`로또 추첨 정보 추가 실패: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        hideSpinner(submitBtn);
    }
}


// --- 페이지 로드 시 초기화 함수 호출 ---
document.addEventListener('DOMContentLoaded', initializeFirebase); // Firebase 초기화는 모든 페이지에서 한 번만 실행
