// TODO: 여기에 당신의 Cloud Functions 트리거 URL을 붙여넣으세요!
const CLOUD_FUNCTION_URL = "https://us-central1-lucky-vicky-lotto-app.cloudfunctions.net/get-lotto-numbers"

const generateBtn = document.getElementById('generateBtn');
const numSetsSelect = document.getElementById('numSets');
const lottoNumbersDisplay = document.getElementById('lottoNumbersDisplay');
const messageElement = document.getElementById('message');

// 날짜 정보 표시할 요소들
const latestDrawNumSpan = document.getElementById('latestDrawNum');
const nextDrawDateSpan = document.getElementById('nextDrawDate');
const nextDrawNumSpan = document.getElementById('nextDrawNum');

// 최신 당첨 내용 관련 요소
const viewDrawDetailsBtn = document.getElementById('viewDrawDetails');
const latestDrawDetailsSection = document.getElementById('latestDrawDetailsSection');
const displayedDrawNumSpan = document.getElementById('displayedDrawNum');
const hideDrawDetailsBtn = document.getElementById('hideDrawDetails');

// 모델 선택 탭 버튼 요소
const statisticalTabBtn = document.getElementById('statisticalTabBtn');
const mlTabBtn = document.getElementById('mlTabBtn');
const tabButtons = document.querySelectorAll('.tab-button'); // 모든 탭 버튼 선택

let currentModelType = 'statistical'; // 현재 선택된 모델 타입 (기본값: 통계 기반)
let cachedLatestDrawDetails = null; // API에서 가져온 최신 당첨 상세 정보를 저장할 변수

// --- 초기화 함수: 페이지 로드 시 날짜 정보 계산 및 표시 ---
function initializeApp() {
    displayNextDrawDateAndNumber(); // 다음 추첨일 및 회차 계산 및 표시
    // 초기 로드 시 active 탭 설정 (통계 기반이 기본이므로)
    tabButtons.forEach(button => {
        if (button.dataset.modelType === currentModelType) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// --- 다음 로또 추첨일 및 회차 계산 함수 ---
async function displayNextDrawDateAndNumber() {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0(일요일) ~ 6(토요일)

    let daysUntilSaturday;
    if (currentDayOfWeek === 6) { // 오늘이 토요일이면, 다음 토요일은 7일 후 (같은 요일)
        daysUntilSaturday = 7;
    } else { // 오늘이 토요일이 아니면, 다음 토요일까지 남은 일수 계산
        daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7;
        if (daysUntilSaturday === 0) { // 만약 계산상 0일이 나오면 (이미 토요일인데, getDay()는 6이므로 이 조건은 안 타야 함), 다음 주 토요일로
            daysUntilSaturday = 7;
        }
    }

    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + daysUntilSaturday);

    const year = nextSaturday.getFullYear();
    const month = nextSaturday.getMonth() + 1;
    const day = nextSaturday.getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = dayNames[nextSaturday.getDay()];

    nextDrawDateSpan.textContent = `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;

    // 최신 회차를 가져와서 다음 회차 계산 (API 호출을 통해)
    try {
        console.log("Fetching latest draw number and details from API...");
        // API URL에 model_type 파라미터가 필요 없으므로 제거
        const response = await fetch(CLOUD_FUNCTION_URL, { method: 'GET' });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 오류: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log("API response for latest draw number and details:", data);

        if (data.latest_draw_number !== undefined) {
            latestDrawNumSpan.textContent = `${data.latest_draw_number}회`;
            nextDrawNumSpan.textContent = `${data.latest_draw_number + 1}회`;
            cachedLatestDrawDetails = data.latest_draw_details;
        } else {
            console.warn("API 응답에 'latest_draw_number' 필드가 없습니다.", data);
            latestDrawNumSpan.textContent = '정보 없음';
            nextDrawNumSpan.textContent = '계산 불가';
        }
    } catch (error) {
        console.error("최신 회차 정보 로딩 오류:", error);
        latestDrawNumSpan.textContent = '오류 발생';
        nextDrawNumSpan.textContent = '오류 발생';
    }
}

// --- 최신 당첨 내용 표시 함수 ---
function displayLatestDrawDetails() {
    if (!cachedLatestDrawDetails) {
        showMessage('최신 당첨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 'warning');
        return;
    }

    displayedDrawNumSpan.textContent = latestDrawNumSpan.textContent.replace('회', '');

    const details = cachedLatestDrawDetails;
    const mainNumbersDiv = latestDrawDetailsSection.querySelector('.main-numbers');
    mainNumbersDiv.innerHTML = '';

    details.winning_numbers.forEach(num => {
        const numSpan = document.createElement('span');
        numSpan.classList.add('lotto-number');
        numSpan.textContent = num;
        mainNumbersDiv.appendChild(numSpan);
    });

    const bonusNumSpan = latestDrawDetailsSection.querySelector('.bonus-num');
    bonusNumSpan.textContent = details.bonus_number;

    const prizeInfoGrid = latestDrawDetailsSection.querySelector('.prize-info-grid');
    prizeInfoGrid.innerHTML = '';

    const rankNames = {
        "1st": "1등", "2nd": "2등", "3rd": "3등", "4th": "4등", "5th": "5등"
    };

    // 등수별 당첨금을 통화 형식으로 포맷
    for (const rank in details.prizes) {
        if (details.prizes.hasOwnProperty(rank) && details.prizes[rank] !== null) {
            const prizeItem = document.createElement('div');
            prizeItem.classList.add('prize-item');
            const formattedPrize = details.prizes[rank].toLocaleString('ko-KR'); // 한국 통화 형식
            prizeItem.innerHTML = `<span>${rankNames[rank]}</span> <span>${formattedPrize}원</span>`;
            prizeInfoGrid.appendChild(prizeItem);
        }
    }

    latestDrawDetailsSection.classList.remove('hidden');
}

// --- 모델 타입 전환 핸들러 ---
function switchModelType(event) {
    const selectedButton = event.target;
    currentModelType = selectedButton.dataset.modelType;

    // 모든 탭 버튼의 active 클래스 제거
    tabButtons.forEach(button => button.classList.remove('active'));
    // 클릭된 버튼에 active 클래스 추가
    selectedButton.classList.add('active');

    // 메시지 초기화 (새로운 추천 시작 전) - 번호는 사라지지 않고 유지
    showMessage('', 'hidden');
    // lottoNumbersDisplay.innerHTML = ''; // 이 줄을 주석 처리하거나 삭제하여 기존 번호를 유지

    console.log(`Model type switched to: ${currentModelType}`);

    // "몇 세트 선택"을 1세트로 리셋
    numSetsSelect.value = "1";
}


// --- 로또 번호 생성 함수 (모델 타입에 따라 API 호출 변경) ---
async function generateLottoNumbers() {
    const numSets = parseInt(numSetsSelect.value);
    // lottoNumbersDisplay.innerHTML = ''; // 이 줄을 주석 처리하거나 삭제하여 기존 번호를 유지
    messageElement.classList.add('hidden');

    showMessage('로또 번호 생성 중입니다...', 'info');
    // 기존 번호 위에 스피너가 나타나지 않도록 수정: spinner는 임시로 추가하지 않거나 다른 방식으로 표시
    // lottoNumbersDisplay.innerHTML = '<div class="spinner"></div>'; // 이 줄은 제거하거나, 더 나은 로딩 인디케이터로 대체

    const recommendedSets = [];
    let hasError = false;

    // 현재 선택된 모델 타입에 따라 번호 추천 메시지 결정
    const modelLabel = currentModelType === 'statistical' ? '통계 기반 추천 번호' : 'ML 기반 추천 번호';

    // 로딩 스피너를 모든 번호가 생성될 때까지 표시
    const spinnerDiv = document.createElement('div');
    spinnerDiv.classList.add('spinner');
    lottoNumbersDisplay.appendChild(spinnerDiv);


    for (let i = 0; i < numSets; i++) {
        try {
            // 모델 타입 쿼리 파라미터 추가
            const apiUrl = `${CLOUD_FUNCTION_URL}?model_type=${currentModelType}`;
            console.log(`Calling API: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API 오류: ${errorData.error || response.statusText}`);
            }

            const data = await response.json();
            if (data.lotto_numbers && Array.isArray(data.lotto_numbers)) {
                // displayLottoSet 함수에 modelLabel 전달
                recommendedSets.push({ numbers: data.lotto_numbers.sort((a, b) => a - b), modelType: modelLabel });
            } else {
                throw new Error("올바른 로또 번호 형식이 아닙니다.");
            }
        } catch (error) {
            console.error("로또 번호 생성 중 오류 발생:", error);
            showMessage(`번호 생성에 실패했습니다: ${error.message}`, 'error');
            hasError = true;
            break;
        }
    }

    // 모든 번호 생성 후 스피너 제거
    if (spinnerDiv.parentNode) {
        spinnerDiv.parentNode.removeChild(spinnerDiv);
    }

    if (!hasError) {
        if (recommendedSets.length > 0) {
            recommendedSets.forEach((set, index) => { // set 객체에서 numbers와 modelType 추출
                displayLottoSet(set.numbers, index + 1, set.modelType); // modelType 인자 추가
            });
            showMessage('로또 추천 번호가 생성되었습니다!', 'success');
        } else {
            showMessage('생성된 로또 번호가 없습니다. 다시 시도해주세요.', 'warning');
        }
    }
}

// 로또 번호 세트를 UI에 표시하는 함수 (modelLabel 인자 추가)
function displayLottoSet(numbers, setIndex, modelLabel) {
    const card = document.createElement('div');
    card.classList.add('lotto-set-card');

    const title = document.createElement('h3');
    // 모델 타입 라벨을 제목에 추가
    title.textContent = `[${modelLabel}] 추천 번호 #${setIndex}`;
    card.appendChild(title);

    const numbersDiv = document.createElement('div');
    numbersDiv.classList.add('lotto-numbers');
    numbers.forEach(num => {
        const numSpan = document.createElement('span');
        numSpan.classList.add('lotto-number');
        numSpan.textContent = num;
        numbersDiv.appendChild(numSpan);
    });
    card.appendChild(numbersDiv);

    // TODO: 여기에 과거 적중 확률 표시 로직 추가 (추후 구현)
    const hitRate = document.createElement('p');
    hitRate.classList.add('hit-rate');
    hitRate.textContent = `(지난 회차 적중률: 계산 예정)`;
    card.appendChild(hitRate);

    lottoNumbersDisplay.appendChild(card);
}

// 사용자에게 메시지를 표시하는 함수 (성공, 오류, 정보 등)
function showMessage(msg, type) {
    messageElement.textContent = msg;
    messageElement.classList.remove('hidden', 'error', 'info', 'success', 'warning');
    messageElement.classList.add(type);
    messageElement.classList.remove('hidden');

    if (type === 'error') messageElement.style.color = '#f44336';
    else if (type === 'info') messageElement.style.color = '#2196F3';
    else if (type === 'success') messageElement.style.color = '#4CAF50';
    else if (type === 'warning') messageElement.style.color = '#ff9800';
    else messageElement.style.color = '#333';
}


// --- 이벤트 리스너 등록 ---
generateBtn.addEventListener('click', generateLottoNumbers);
viewDrawDetailsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    displayLatestDrawDetails();
});
hideDrawDetailsBtn.addEventListener('click', () => {
    latestDrawDetailsSection.classList.add('hidden');
});

// 탭 버튼 클릭 이벤트 리스너
statisticalTabBtn.addEventListener('click', switchModelType);
mlTabBtn.addEventListener('click', switchModelType);

// --- 페이지 로드 시 초기화 함수 호출 ---
document.addEventListener('DOMContentLoaded', initializeApp);
