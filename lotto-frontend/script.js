// TODO: 여기에 당신의 Cloud Functions 트리거 URL을 붙여넣으세요!
const CLOUD_FUNCTION_URL = "https://us-central1-lucky-vicky-lotto-app.cloudfunctions.net/get-lotto-numbers"

const generateBtn = document.getElementById('generateBtn');
const numSetsSelect = document.getElementById('numSets');
const lottoNumbersDisplay = document.getElementById('lottoNumbersDisplay');
const messageElement = document.getElementById('message');

// Elements for displaying date information
const latestDrawNumSpan = document.getElementById('latestDrawNum');
const nextDrawDateSpan = document.getElementById('nextDrawDate');
const nextDrawNumSpan = document.getElementById('nextDrawNum');

// Elements for latest draw details
const viewDrawDetailsBtn = document.getElementById('viewDrawDetails');
const latestDrawDetailsSection = document.getElementById('latestDrawDetailsSection');
const displayedDrawNumSpan = document.getElementById('displayedDrawNum');
const hideDrawDetailsBtn = document.getElementById('hideDrawDetails');

// Model selection tab buttons
const statisticalTabBtn = document.getElementById('statisticalTabBtn');
const mlTabBtn = document.getElementById('mlTabBtn');
const tabButtons = document.querySelectorAll('.tab-button'); // Select all tab buttons

let currentModelType = 'statistical'; // Currently selected model type (default: statistical)
let cachedLatestDrawDetails = null; // Variable to store latest draw details from API

// --- Initialization Function: Calculates and displays date info on page load ---
function initializeApp() {
    displayNextDrawDateAndNumber(); // Calculate and display next draw date and number
    // Set active tab on initial load (statistical is default)
    tabButtons.forEach(button => {
        if (button.dataset.modelType === currentModelType) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// --- Function to calculate and display the next lotto draw date and number ---
async function displayNextDrawDateAndNumber() {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)

    let daysUntilSaturday;
    if (currentDayOfWeek === 6) { // If today is Saturday, next Saturday is 7 days later
        daysUntilSaturday = 7;
    } else { // If today is not Saturday, calculate remaining days until next Saturday
        daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7;
        if (daysUntilSaturday === 0) { // If calculated as 0 days (e.g., already past Saturday), set to next week's Saturday
            daysUntilSaturday = 7;
        }
    }

    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + daysUntilSaturday);

    const year = nextSaturday.getFullYear();
    const month = nextSaturday.getMonth() + 1;
    const day = nextSaturday.getDate();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // English day names
    const dayOfWeek = dayNames[nextSaturday.getDay()];

    nextDrawDateSpan.textContent = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} (${dayOfWeek})`;

    // Fetch latest draw number to calculate next draw number
    try {
        console.log("Fetching latest draw number and details from API...");
        const response = await fetch(CLOUD_FUNCTION_URL, { method: 'GET' });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        console.log("API response for latest draw number and details:", data);

        if (data.latest_draw_number !== undefined) {
            latestDrawNumSpan.textContent = `${data.latest_draw_number}th`; // Suffix changed to English
            nextDrawNumSpan.textContent = `${data.latest_draw_number + 1}th`; // Suffix changed to English
            cachedLatestDrawDetails = data.latest_draw_details;
        } else {
            console.warn("API response missing 'latest_draw_number' field.", data);
            latestDrawNumSpan.textContent = 'N/A'; // N/A for Not Available
            nextDrawNumSpan.textContent = 'N/A';
        }
    } catch (error) {
        console.error("Error loading latest draw info:", error);
        latestDrawNumSpan.textContent = 'Error';
        nextDrawNumSpan.textContent = 'Error';
    }
}

// --- Function to display latest draw details ---
function displayLatestDrawDetails() {
    if (!cachedLatestDrawDetails) {
        showMessage('Failed to load latest draw information. Please try again later.', 'warning');
        return;
    }

    displayedDrawNumSpan.textContent = latestDrawNumSpan.textContent.replace('th', ''); // Remove 'th' suffix for display

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

    const rankNames = { // English rank names
        "1st": "1st Prize", "2nd": "2nd Prize", "3rd": "3rd Prize", "4th": "4th Prize", "5th": "5th Prize"
    };

    // Format prize amounts as currency
    for (const rank in details.prizes) {
        if (details.prizes.hasOwnProperty(rank) && details.prizes[rank] !== null) {
            const prizeItem = document.createElement('div');
            prizeItem.classList.add('prize-item');
            const formattedPrize = details.prizes[rank].toLocaleString('en-US', { style: 'currency', currency: 'KRW' }); // Format as Korean Won currency
            prizeItem.innerHTML = `<span>${rankNames[rank]}</span> <span>${formattedPrize}</span>`;
            prizeInfoGrid.appendChild(prizeItem);
        }
    }

    latestDrawDetailsSection.classList.remove('hidden');
}

// --- Model type switch handler ---
function switchModelType(event) {
    const selectedButton = event.target;
    currentModelType = selectedButton.dataset.modelType;

    // Remove active class from all tab buttons
    tabButtons.forEach(button => button.classList.remove('active'));
    // Add active class to the clicked button
    selectedButton.classList.add('active');

    // Reset message (before starting new recommendation) - numbers remain visible
    showMessage('', 'hidden');
    // lottoNumbersDisplay.innerHTML = ''; // Keep this commented to append numbers

    console.log(`Model type switched to: ${currentModelType}`);

    // Reset "How many sets" selection to 1
    numSetsSelect.value = "1";
}


// --- Lotto number generation function (API call changes based on model type) ---
async function generateLottoNumbers() {
    const numSets = parseInt(numSetsSelect.value);
    messageElement.classList.add('hidden');

    showMessage('Generating lotto numbers...', 'info');

    const recommendedSets = []; // This will store the final sets for display
    let hasError = false;

    // Determine the model label for the generated numbers
    const modelLabel = currentModelType === 'statistical' ? 'Statistical Recommendation Numbers' : 'ML-based Recommendation Numbers';

    // Add a single loading spinner for the entire generation process
    const spinnerDiv = document.createElement('div');
    spinnerDiv.classList.add('spinner');
    lottoNumbersDisplay.appendChild(spinnerDiv); // Append spinner to the display area

    try {
        // Make one API call to generate all requested sets
        // Pass num_sets as a query parameter to the backend
        const apiUrl = `${CLOUD_FUNCTION_URL}?model_type=${currentModelType}&num_sets=${numSets}`;
        console.log(`Calling API: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        // Backend now returns data.lotto_numbers as an array of objects: 
        // [{"numbers": [...], "historical_hit_rates": {...}}, ...]
        if (data.lotto_numbers && Array.isArray(data.lotto_numbers)) {
            data.lotto_numbers.forEach((lottoSetData, indexInResponse) => {
                // Add a defensive check here to ensure lottoSetData.numbers is valid
                if (lottoSetData && Array.isArray(lottoSetData.numbers)) {
                    // Pass the entire lottoSetData (including historical_hit_rates) to display
                    displayLottoSet(
                        lottoSetData.numbers.sort((a, b) => a - b), // Ensure numbers are sorted for display
                        indexInResponse + 1, // Number sets from 1 to numSets
                        modelLabel,
                        lottoSetData.historical_hit_rates
                    );
                } else {
                    console.error("Received malformed lotto set data:", lottoSetData);
                    showMessage('Received invalid lotto number set from API. Please check console for details.', 'error');
                    hasError = true; // Mark as error to prevent success message
                }
            });
            // Only show success message if no errors occurred during iteration
            if (!hasError) {
                showMessage('Lotto recommendation numbers generated!', 'success');
            }
        } else {
            throw new Error("Invalid lotto numbers format from API.");
        }
    } catch (error) {
        console.error("Error generating lotto numbers:", error);
        showMessage(`Failed to generate numbers: ${error.message}`, 'error');
        hasError = true;
    } finally {
        // Always remove the spinner after generation (or error)
        if (spinnerDiv.parentNode) {
            spinnerDiv.parentNode.removeChild(spinnerDiv);
        }
    }
}

// Function to display a lotto number set on the UI (now includes historicalHitRates)
function displayLottoSet(numbers, setIndex, modelLabel, historicalHitRates) {
    const card = document.createElement('div');
    card.classList.add('lotto-set-card');

    const title = document.createElement('h3');
    title.textContent = `[${modelLabel}] Recommended Numbers #${setIndex}`;
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

    // Display historical hit rates
    const hitRate = document.createElement('p');
    hitRate.classList.add('hit-rate');

    if (historicalHitRates) {
        let hitRateText = "Historical Matches: ";
        const matches = [];
        if (historicalHitRates["1st"] > 0) matches.push(`${historicalHitRates["1st"]} (1st)`);
        if (historicalHitRates["2nd"] > 0) matches.push(`${historicalHitRates["2nd"]} (2nd)`);
        if (historicalHitRates["3rd"] > 0) matches.push(`${historicalHitRates["3rd"]} (3rd)`);
        if (historicalHitRates["4th"] > 0) matches.push(`${historicalHitRates["4th"]} (4th)`);
        if (historicalHitRates["5th"] > 0) matches.push(`${historicalHitRates["5th"]} (5th)`);

        if (matches.length > 0) {
            hitRateText += matches.join(', ');
        } else {
            hitRateText += "None (3rd-5th grades)"; // No matches for 3rd, 4th, 5th prizes
        }
        hitRate.textContent = hitRateText;
    } else {
        hitRate.textContent = `(Historical Match Rate: Calculating...)`; // Fallback text
    }
    card.appendChild(hitRate);

    lottoNumbersDisplay.appendChild(card);
}

// Function to display messages to the user (success, error, info, etc.)
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


// --- Event Listeners ---
generateBtn.addEventListener('click', generateLottoNumbers);
viewDrawDetailsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    displayLatestDrawDetails();
});
hideDrawDetailsBtn.addEventListener('click', () => {
    latestDrawDetailsSection.classList.add('hidden');
});

// Tab button click event listeners
statisticalTabBtn.addEventListener('click', switchModelType);
mlTabBtn.addEventListener('click', switchModelType);

// --- Call initialization function on page load ---
document.addEventListener('DOMContentLoaded', initializeApp);
