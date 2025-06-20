import pandas as pd
from collections import Counter
import random
import os
import json

# --- 데이터 로드 함수 ---
def load_lotto_data():
    if os.path.exists('data/lotto.csv'):
        csv_path = 'data/lotto.csv'
    elif os.path.exists('lotto-recommender-app/data/lotto.csv'):
        csv_path = 'lotto-recommender-app/data/lotto.csv'
    else:
        raise FileNotFoundError("lotto.csv not found in expected locations.")

    df_lotto = pd.read_csv(csv_path, header=None, sep=',')
    return df_lotto

# --- 기존 통계 함수 ---
def calc_frequency(df_numbers):
    df_numbers_numeric = df_numbers.apply(pd.to_numeric, errors='coerce')
    all_numbers = df_numbers_numeric.values.flatten()
    all_numbers = all_numbers[~pd.isna(all_numbers)]
    all_numbers = all_numbers.astype(int)
    frequency = Counter(all_numbers)
    return frequency

def calc_gap(df_lotto_original):
    if df_lotto_original.empty or len(df_lotto_original.columns) < 7:
        raise ValueError("Lotto data format is incorrect for gap calculation.")

    gap_data = {}
    num_rows = len(df_lotto_original)
    
    for num in range(1, 46):
        found_at_draw_index = -1
        for i in range(num_rows - 1, -1, -1):
            draw_numbers = df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()
            try:
                draw_numbers = [int(n) for n in draw_numbers]
            except ValueError:
                continue
            if num in draw_numbers:
                found_at_draw_index = i
                break
        
        if found_at_draw_index != -1:
            gap = (num_rows - 1) - found_at_draw_index 
        else:
            gap = num_rows
        gap_data[num] = gap
    return gap_data

# --- 새로운 통계 패턴 분석 함수들 ---

# 연속 번호 패턴 분석
def analyze_consecutive_patterns(df_lotto_original):
    consecutive_counts = {2: 0, 3: 0, 4: 0, 5: 0} # 2개, 3개, 4개, 5개 연속 번호
    total_draws = len(df_lotto_original)

    for i in range(total_draws):
        draw_numbers = sorted([int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()])
        
        current_consecutive = 1
        max_consecutive = 1
        
        for j in range(len(draw_numbers) - 1):
            if draw_numbers[j+1] == draw_numbers[j] + 1:
                current_consecutive += 1
            else:
                max_consecutive = max(max_consecutive, current_consecutive)
                current_consecutive = 1
        max_consecutive = max(max_consecutive, current_consecutive) # 마지막 연속 번호 처리

        if max_consecutive >= 2:
            consecutive_counts[2] += 1
        if max_consecutive >= 3:
            consecutive_counts[3] += 1
        if max_consecutive >= 4:
            consecutive_counts[4] += 1
        if max_consecutive >= 5:
            consecutive_counts[5] += 1
            
    # 각 연속 번호 패턴이 총 추첨에서 나타난 비율을 반환 (0으로 나누는 것 방지)
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in consecutive_counts.items()}

# 홀수/짝수 비율 분석
def analyze_odd_even_ratios(df_lotto_original):
    odd_even_counts = Counter() # (홀수 개수, 짝수 개수) 튜플
    total_draws = len(df_lotto_original)

    for i in range(total_draws):
        draw_numbers = [int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()]
        odd_count = sum(1 for num in draw_numbers if num % 2 != 0)
        even_count = 6 - odd_count
        odd_even_counts[(odd_count, even_count)] += 1
    
    # 각 비율이 나타난 빈도를 백분율로 반환
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in odd_even_counts.items()}

# 번호 총합 범위 분석
def analyze_sum_ranges(df_lotto_original):
    sum_ranges = Counter()
    total_draws = len(df_lotto_original)
    
    # 일반적으로 사용되는 로또 합계 범위 (조정 가능)
    ranges = [
        (21, 50), (51, 80), (81, 110), (111, 140), (141, 170), (171, 200), (201, 231)
    ]

    for i in range(total_draws):
        draw_numbers = [int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()]
        current_sum = sum(draw_numbers)
        
        found_range = False
        for r_min, r_max in ranges:
            if r_min <= current_sum <= r_max:
                sum_ranges[f'{r_min}~{r_max}'] += 1
                found_range = True
                break
        if not found_range: # 정의된 범위 밖에 있는 경우
            sum_ranges['Other'] += 1
            
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in sum_ranges.items()}

# 끝자리 수 패턴 분석
def analyze_ending_digit_patterns(df_lotto_original):
    ending_digit_counts = Counter()
    total_draws = len(df_lotto_original)

    for i in range(total_draws):
        draw_numbers = [int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()]
        digits = [num % 10 for num in draw_numbers] # 끝자리 추출
        ending_digit_counts[tuple(sorted(digits))] += 1 # 정렬된 튜플로 패턴 저장
    
    # 각 끝자리 패턴이 나타난 빈도를 백분율로 반환
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in ending_digit_counts.items()}


# --- 추천 번호 생성 함수 (고도화) ---
def generate_numbers_stat(frequency_data, gap_data, consecutive_patterns, odd_even_ratios, sum_ranges, ending_digit_patterns, num_to_generate=6):
    recommended_numbers = set()
    number_scores = {}
    
    # 1. 개별 번호 점수 초기화 (빈도 + 간격)
    for num in range(1, 46):
        freq = frequency_data.get(num, 0)
        gap = gap_data.get(num, 0)
        score = freq + (gap * 2) # 기존 점수 계산
        number_scores[num] = score

    # 2. 번호 조합의 '패턴' 점수 계산 및 반영 (가중치 조절 가능)
    # 현재는 개별 번호 점수만 고려하고 패턴 점수는 후속 처리에서 사용하거나,
    # 개별 번호 선택 후 조합을 평가하여 다시 뽑는 방식으로 적용할 수 있습니다.
    # 여기서는 점수 계산 로직을 복잡하게 만들기보다는, 먼저 개별 번호의 통계적 우위를 강화하는 데 집중합니다.
    # 패턴 점수는 최종 조합 생성 후 '조합의 유효성 검사'에 더 적합합니다.

    # 3. 번호 선택 로직 개선: 상위 점수 후보군에서 시작하되, 패턴을 고려하여 조합을 완성
    
    # 먼저, 점수가 높은 번호 20개를 후보군으로 선택 (조정 가능)
    sorted_numbers_by_score = sorted(number_scores.items(), key=lambda item: item[1], reverse=True)
    top_candidates = [num for num, score in sorted_numbers_by_score[:20]] 

    # 최종 추천 번호 조합 생성 (패턴 가이드라인 적용)
    # 목표: 6개의 숫자를 선택할 때, 특정 패턴을 만족하는 조합을 만들도록 시도
    
    # 목표 홀수/짝수 비율 (예: 3홀 3짝, 또는 4홀 2짝이 가장 흔함)
    target_odd_even_ratios = [(3, 3), (4, 2), (2, 4)]
    # 목표 총합 범위 (예: 80-150 사이가 가장 흔함)
    target_sum_range = (80, 150) 
    # 목표 연속 번호 개수 (예: 0~2개 연속 번호가 가장 흔함)
    target_consecutive_max = 2 

    while len(recommended_numbers) < num_to_generate:
        # 남아있는 후보군이 없거나, 너무 적으면 전체 범위에서 선택
        if not top_candidates:
            remaining_numbers = list(set(range(1, 46)) - recommended_numbers)
            if not remaining_numbers: break
            chosen = random.choice(remaining_numbers)
        else:
            chosen = random.choice(top_candidates)
            top_candidates.remove(chosen) # 중복 선택 방지

        recommended_numbers.add(chosen)
        
        # 임시 조합으로 패턴 검사 (매번 엄격하게 적용하기보다, 최종 단계에서 조합을 검토하는 것이 현실적)
        # 이 부분은 지금 당장 복잡하게 구현하기보다, 나중에 패턴 점수화 로직을 추가할 때 고려

    # 최종 생성된 번호 조합의 패턴을 확인하고 필요시 재조정하는 로직 추가 가능
    # 현재는 개별 번호 점수 기반으로 선택 후 반환
    
    final_numbers = sorted(list(recommended_numbers))

    # --- 최종 추천 조합의 패턴 점수 계산 (새로 추가) ---
    # 이 부분은 생성된 조합이 얼마나 '좋은' 패턴을 가지고 있는지 평가하는 용도
    # 번호 선택 로직에 직접 반영하기는 어려우므로, 참고용 점수로 활용

    # 홀짝 비율 점수
    odd_count = sum(1 for num in final_numbers if num % 2 != 0)
    even_count = 6 - odd_count
    odd_even_score = 0
    if (odd_count, even_count) in [(3,3), (4,2), (2,4)]: # 가장 흔한 비율
        odd_even_score += 10 # 높은 점수
    
    # 번호 합계 점수
    current_sum = sum(final_numbers)
    sum_score = 0
    if target_sum_range[0] <= current_sum <= target_sum_range[1]: # 목표 합계 범위 내
        sum_score += 10

    # 연속 번호 점수
    current_consecutive = 1
    max_consecutive = 1
    sorted_final_numbers = sorted(final_numbers)
    for j in range(len(sorted_final_numbers) - 1):
        if sorted_final_numbers[j+1] == sorted_final_numbers[j] + 1:
            current_consecutive += 1
        else:
            max_consecutive = max(max_consecutive, current_consecutive)
            current_consecutive = 1
    max_consecutive = max(max_consecutive, current_consecutive)
    consecutive_score = 0
    if max_consecutive <= target_consecutive_max: # 목표 연속 번호 개수 이하
        consecutive_score += 10

    # 이 패턴 점수들을 어떻게 활용할지는 결정 필요 (예: 다시 뽑기, 사용자에게 정보 제공 등)
    # 현재는 번호 선택에 직접 반영하지 않고, 로직에 대한 이해를 돕기 위해 추가

    return final_numbers

# --- 전역 변수 초기화 (콜드 스타트 시 한 번만 실행) ---
# 이 부분은 Cloud Functions 인스턴스가 로드될 때 한 번만 실행되어
# 이후의 요청 처리 속도를 향상시킵니다.
_df_lotto_data = None
_latest_draw_number = None
_latest_draw_details = None
_frequency_data = None
_gap_data = None
_consecutive_patterns = None
_odd_even_ratios = None
_sum_ranges = None
_ending_digit_patterns = None

def _initialize_global_data():
    global _df_lotto_data, _latest_draw_number, _latest_draw_details, \
           _frequency_data, _gap_data, _consecutive_patterns, \
           _odd_even_ratios, _sum_ranges, _ending_digit_patterns

    if _df_lotto_data is None: # 이미 초기화되었으면 다시 하지 않음
        print("Initializing global data for Cloud Function...")
        try:
            _df_lotto_data = load_lotto_data()

            if _df_lotto_data.empty:
                raise ValueError("Loaded lotto data DataFrame is empty.")

            _latest_draw_number = int(_df_lotto_data.iloc[-1, 0])
            
            latest_draw_row = _df_lotto_data.iloc[-1].tolist()
            winning_numbers = [int(n) for n in latest_draw_row[1:7]]
            bonus_number = int(latest_draw_row[7])
            prizes = {
                "1st": int(latest_draw_row[9]) if len(latest_draw_row) > 9 and pd.notna(latest_draw_row[9]) else None,
                "2nd": int(latest_draw_row[10]) if len(latest_draw_row) > 10 and pd.notna(latest_draw_row[10]) else None,
                "3rd": int(latest_draw_row[11]) if len(latest_draw_row) > 11 and pd.notna(latest_draw_row[11]) else None,
                "4th": int(latest_draw_row[12]) if len(latest_draw_row) > 12 and pd.notna(latest_draw_row[12]) else None,
                "5th": int(latest_draw_row[13]) if len(latest_draw_row) > 13 and pd.notna(latest_draw_row[13]) else None,
            }
            _latest_draw_details = {
                "winning_numbers": winning_numbers,
                "bonus_number": bonus_number,
                "prizes": prizes
            }
            
            lotto_numbers_columns_for_calc = [1, 2, 3, 4, 5, 6]
            df_lotto_for_calc = _df_lotto_data[lotto_numbers_columns_for_calc].copy()

            _consecutive_patterns = analyze_consecutive_patterns(_df_lotto_data)
            _odd_even_ratios = analyze_odd_even_ratios(_df_lotto_data)
            _sum_ranges = analyze_sum_ranges(_df_lotto_data)
            _ending_digit_patterns = analyze_ending_digit_patterns(_df_lotto_data)
            
            _frequency_data = calc_frequency(df_lotto_for_calc)
            _gap_data = calc_gap(_df_lotto_data)
            
            print("Global data initialization complete.")

        except Exception as e:
            print(f"Error during global data initialization: {e}")
            # 초기화 실패 시, 함수 호출에서 오류를 반환하도록 처리
            _df_lotto_data = pd.DataFrame() # 빈 데이터프레임으로 설정하여 이후 요청에서 오류 발생 유도


# --- Cloud Functions 진입점 ---
def get_lotto_numbers(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
    }

    if request.method == 'OPTIONS':
        return ('', 204, headers)

    # 함수 호출 시마다 전역 데이터 초기화 시도
    _initialize_global_data()

    try:
        # 전역 변수에 데이터가 로드되지 않았다면 오류 반환
        if _df_lotto_data is None or _df_lotto_data.empty:
            return (json.dumps({"error": "Lotto data not initialized or is empty."}), 500, headers)

        # 전역 변수에서 필요한 데이터 사용
        recommended_numbers = generate_numbers_stat(
            _frequency_data, 
            _gap_data, 
            _consecutive_patterns, 
            _odd_even_ratios, 
            _sum_ranges, 
            _ending_digit_patterns
        )

        response_data = {
            "lotto_numbers": recommended_numbers,
            "message": "로또 추천 번호입니다!",
            "latest_draw_number": _latest_draw_number,
            "latest_draw_details": _latest_draw_details
        }
        return (json.dumps(response_data), 200, headers)

    except FileNotFoundError as e:
        return (json.dumps({"error": f"File not found: {str(e)}"}), 500, headers)
    except IndexError as e:
        return (json.dumps({"error": f"Data indexing error, check lotto.csv format (expected at least 14 columns: draw_num, 6_win_nums, bonus_num, ..., 5_prizes): {str(e)}"}), 500, headers)
    except ValueError as e:
        return (json.dumps({"error": f"Data conversion error, check lotto.csv content for non-numeric values or missing data: {str(e)}"}), 500, headers)
    except Exception as e:
        # 예상치 못한 다른 오류 발생 시, 초기화 오류도 포함될 수 있음
        return (json.dumps({"error": f"An unexpected error occurred: {str(e)}"}), 500, headers)

# --- 로컬 테스트를 위한 코드 ---
if __name__ == '__main__':
    print("\n--- 로컬에서 get_lotto_numbers 함수 테스트 ---")
    class MockRequest:
        def __init__(self, method='GET'):
            self.method = method
            self._json_data = None
            self._args = {}

        def get_json(self, silent=True):
            return self._json_data

        @property
        def args(self):
            return self._args

    mock_request = MockRequest()
    response_body, status_code, response_headers = get_lotto_numbers(mock_request)

    print(f"Status Code: {status_code}")
    print(f"Headers: {response_headers}")
    print(f"Body: {response_body}")

    try:
        parsed_response = json.loads(response_body)
        if "lotto_numbers" in parsed_response:
            print(f"추천 로또 번호: {parsed_response['lotto_numbers']}")
            if "latest_draw_number" in parsed_response:
                print(f"최신 회차: {parsed_response['latest_draw_number']}")
            if "latest_draw_details" in parsed_response:
                details = parsed_response["latest_draw_details"]
                print(f"  당첨 번호: {details['winning_numbers']} + 보너스 {details['bonus_number']}")
                for rank, prize in details['prizes'].items():
                    print(f"  {rank} 당첨금: {prize}원")
        elif "error" in parsed_response:
            print(f"오류: {parsed_response['error']}")
    except json.JSONDecodeError:
        print("응답 바디가 JSON 형식이 아닙니다.")
    except Exception as e:
        print(f"응답 파싱 중 오류 발생: {e}")
