// TODO: 여기에 당신의 Cloud Functions 트리거 URL을 붙여넣으세요!
const CLOUD_FUNCTION_URL = "https://us-central1-lucky-vicky-lotto-app.cloudfunctions.net/get-lotto-numbers"

const generateBtn = document.getElementById('generateBtn');
const numSetsSelect = document.getElementById('numSets');
const lottoNumbersDisplay = document.getElementById('lottoNumbersDisplay');
const messageElement = document.getElementById('message');

// 날짜 정보 표시할 요소들
const latestDrawNumSpan = document.getElementById('latestDrawNum');
const nextDrawDateSpan = document.getElementById('nextDrawDate');
const nextDrawNumSpan = document.getElementById('nextDrawNum'); // 다음 추첨 회차를 표시할 새 span

// --- 초기화 함수: 페이지 로드 시 날짜 정보 계산 및 표시 ---
function initializeApp() {
    displayNextDrawDateAndNumber(); // 다음 추첨일 및 회차 계산 및 표시
    // 최신 회차 정보는 API 호출 후 업데이트됩니다. 초기에는 "불러오는 중..."으로 둡니다.
}

// --- 다음 로또 추첨일 및 회차 계산 함수 ---
async function displayNextDrawDateAndNumber() {
    // 현재 날짜 및 요일 계산
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0(일요일) ~ 6(토요일)

    let daysUntilSaturday;
    if (currentDayOfWeek === 6) { // 오늘이 토요일이면, 다음 토요일은 7일 후
        daysUntilSaturday = 7;
    } else { // 오늘이 토요일이 아니면, 다음 토요일까지 남은 일수 계산
        daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7;
        if (daysUntilSaturday === 0) { // 계산상 0일이 나오면 (이미 지난 요일 처리), 다음 주 토요일로
            daysUntilSaturday = 7;
        }
    }

    // 다음 토요일 날짜 계산
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + daysUntilSaturday);

    const year = nextSaturday.getFullYear();
    const month = nextSaturday.getMonth() + 1; // getMonth()는 0부터 시작
    const day = nextSaturday.getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = dayNames[nextSaturday.getDay()];

    // UI에 다음 추첨일 날짜 업데이트
    nextDrawDateSpan.textContent = `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;

    // 최신 회차를 가져와서 다음 회차 계산 (API 호출을 통해)
    try {
        console.log("Fetching latest draw number from API...");
        const response = await fetch(CLOUD_FUNCTION_URL, { method: 'GET' });

        if (!response.ok) {
            const errorText = await response.text(); // 오류 응답 텍스트 가져오기
            throw new Error(`API 오류: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log("API response for latest draw number:", data); // 응답 데이터 로깅

        if (data.latest_draw_number !== undefined) { // latest_draw_number 필드가 존재하는지 확인
            latestDrawNumSpan.textContent = `${data.latest_draw_number}회`;
            // 다음 추첨 회차는 최신 회차 + 1
            nextDrawNumSpan.textContent = `${data.latest_draw_number + 1}회`;
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

// 로또 번호 세트를 UI에 표시하는 함수
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

// 사용자에게 메시지를 표시하는 함수 (성공, 오류, 정보 등)
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
