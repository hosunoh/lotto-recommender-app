// TODO: 여기에 당신의 Cloud Functions 트리거 URL을 붙여넣으세요!
const CLOUD_FUNCTION_URL = "YOUR_CLOUD_FUNCTION_TRIGGER_URL_HERE"; 
// 예: "https://us-central1-lucky-vicky-lotto-app.cloudfunctions.net/get-lotto-numbers"

const generateBtn = document.getElementById('generateBtn');
const numSetsSelect = document.getElementById('numSets');
const lottoNumbersDisplay = document.getElementById('lottoNumbersDisplay');
const messageElement = document.getElementById('message');

// 날짜 정보 표시할 요소들
const latestDrawNumSpan = document.getElementById('latestDrawNum');
const nextDrawDateSpan = document.getElementById('nextDrawDate');

// --- 초기화 함수: 페이지 로드 시 날짜 정보 계산 및 표시 ---
function initializeApp() {
    displayNextDrawDate(); // 다음 추첨일 계산 및 표시
    // TODO: 최신 회차는 API 또는 로컬 데이터로 가져와야 함 (현재는 임시 값)
    // 현재는 'lotto.csv'에 회차 정보가 추가되어 있다면 백엔드에서 가져올 수 있습니다.
    // 일단은 임시 값으로 유지하거나, lotto.csv의 첫 줄 회차를 읽어오도록 개선할 수 있습니다.
    latestDrawNumSpan.textContent = '1121회'; // 임시 값, 실제 최신 회차는 백엔드에서 가져오는 것이 좋음
}

// --- 다음 로또 추첨일 계산 함수 ---
function displayNextDrawDate() {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0(일요일) ~ 6(토요일)

    let daysUntilSaturday;
    if (currentDayOfWeek === 6) { // 오늘이 토요일이면, 다음 토요일은 7일 후
        daysUntilSaturday = 7;
    } else { // 오늘이 토요일이 아니면, 다음 토요일까지 남은 일수 계산
        daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7;
        if (daysUntilSaturday === 0) { // 만약 오늘이 토요일이 아니었지만 계산상 0일이 나온다면 (이미 지난 요일 처리), 다음 주 토요일로
            daysUntilSaturday = 7;
        }
    }
    
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + daysUntilSaturday);

    const year = nextSaturday.getFullYear();
    const month = nextSaturday.getMonth() + 1; // getMonth()는 0부터 시작
    const day = nextSaturday.getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = dayNames[nextSaturday.getDay()];

    nextDrawDateSpan.textContent = `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
}


// --- 이벤트 리스너 등록 ---
generateBtn.addEventListener('click', generateLottoNumbers);

// --- 페이지 로드 시 초기화 함수 호출 ---
document.addEventListener('DOMContentLoaded', initializeApp);


async function generateLottoNumbers() {
    const numSets = parseInt(numSetsSelect.value);
    lottoNumbersDisplay.innerHTML = ''; // 기존 번호 초기화
    messageElement.classList.add('hidden'); // 메시지 숨김
    
    // 로딩 메시지 표시
    showMessage('로또 번호 생성 중입니다...', 'info');
    lottoNumbersDisplay.innerHTML = '<div class="spinner"></div>'; // 로딩 스피너 추가

    const recommendedSets = [];
    let hasError = false;

    for (let i = 0; i < numSets; i++) {
        try {
            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'GET', // GET 요청
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
                recommendedSets.push(data.lotto_numbers.sort((a, b) => a - b)); // 오름차순 정렬
            } else {
                throw new Error("올바른 로또 번호 형식이 아닙니다.");
            }
        } catch (error) {
            console.error("로또 번호 생성 중 오류 발생:", error);
            showMessage(`번호 생성에 실패했습니다: ${error.message}`, 'error');
            hasError = true;
            break; // 오류 발생 시 더 이상 요청하지 않음
        }
    }

    lottoNumbersDisplay.innerHTML = ''; // 로딩 스피너 제거

    if (!hasError) {
        if (recommendedSets.length > 0) {
            recommendedSets.forEach((numbers, index) => {
                displayLottoSet(numbers, index + 1);
            });
            showMessage('로또 추천 번호가 생성되었습니다!', 'success');
        } else {
            showMessage('생성된 로또 번호가 없습니다. 다시 시도해주세요.', 'warning');
        }
    }
}

function displayLottoSet(numbers, setIndex) {
    const card = document.createElement('div');
    card.classList.add('lotto-set-card');

    const title = document.createElement('h3');
    title.textContent = `추천 번호 #${setIndex}`;
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

function showMessage(msg, type) {
    messageElement.textContent = msg;
    messageElement.classList.remove('hidden', 'error', 'info', 'success', 'warning'); // 기존 클래스 제거
    messageElement.classList.add(type); // 새로운 타입 클래스 추가
    messageElement.classList.remove('hidden'); // 메시지 다시 표시

    // 메시지 타입에 따른 색상 변경 (style.css에도 추가)
    if (type === 'error') messageElement.style.color = '#f44336';
    else if (type === 'info') messageElement.style.color = '#2196F3';
    else if (type === 'success') messageElement.style.color = '#4CAF50';
    else if (type === 'warning') messageElement.style.color = '#ff9800';
    else messageElement.style.color = '#333';
}