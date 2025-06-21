import pandas as pd
from collections import Counter
import random
import os
import json
from sklearn.cluster import KMeans 
import numpy as np 

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

# --- 통계 패턴 분석 함수들 ---
def analyze_consecutive_patterns(df_lotto_original):
    consecutive_counts = {2: 0, 3: 0, 4: 0, 5: 0} 
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
        max_consecutive = max(max_consecutive, current_consecutive) 
        if max_consecutive >= 2: consecutive_counts[2] += 1
        if max_consecutive >= 3: consecutive_counts[3] += 1
        if max_consecutive >= 4: consecutive_counts[4] += 1
        if max_consecutive >= 5: consecutive_counts[5] += 1
            
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in consecutive_counts.items()}

def analyze_odd_even_ratios(df_lotto_original):
    odd_even_counts = Counter() 
    total_draws = len(df_lotto_original)

    for i in range(total_draws):
        draw_numbers = [int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()]
        odd_count = sum(1 for num in draw_numbers if num % 2 != 0)
        even_count = 6 - odd_count
        odd_even_counts[(odd_count, even_count)] += 1
    
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in odd_even_counts.items()}

def analyze_sum_ranges(df_lotto_original):
    sum_ranges = Counter()
    total_draws = len(df_lotto_original)
    
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
        if not found_range:
            sum_ranges['Other'] += 1
            
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in sum_ranges.items()}

def analyze_ending_digit_patterns(df_lotto_original):
    ending_digit_counts = Counter()
    total_draws = len(df_lotto_original)

    for i in range(total_draws):
        draw_numbers = [int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()]
        digits = [num % 10 for num in draw_numbers] 
        ending_digit_counts[tuple(sorted(digits))] += 1 
    
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in ending_digit_counts.items()}


# --- 추천 번호 생성 함수 (고도화 통계 모델) ---
def generate_numbers_stat(frequency_data, gap_data, consecutive_patterns, odd_even_ratios, sum_ranges, ending_digit_patterns, all_past_draw_details, num_to_generate=6):
    recommended_numbers_set = set()
    number_scores = {}
    
    for num in range(1, 46):
        freq = frequency_data.get(num, 0)
        gap = gap_data.get(num, 0)
        score = freq + (gap * 2) 
        number_scores[num] = score
    
    sorted_numbers_by_score = sorted(number_scores.items(), key=lambda item: item[1], reverse=True)
    top_candidates = [num for num, score in sorted_numbers_by_score[:20]] 

    while len(recommended_numbers_set) < num_to_generate:
        if not top_candidates:
            remaining_numbers = list(set(range(1, 46)) - recommended_numbers_set)
            if not remaining_numbers: break
            chosen = random.choice(remaining_numbers)
        else:
            chosen = random.choice(top_candidates)
            top_candidates.remove(chosen) 

        recommended_numbers_set.add(chosen)
        
    final_numbers = sorted(list(recommended_numbers_set))
    
    # 생성된 번호의 과거 적중률 계산
    historical_hit_rates = calculate_historical_matches(final_numbers, all_past_draw_details)

    return {"numbers": final_numbers, "historical_hit_rates": historical_hit_rates}


# --- 새로운 K-means 모델 관련 함수 ---
def train_kmeans_model(df_lotto_original, n_clusters=5):
    lotto_numbers_data = df_lotto_original.iloc[:, 1:7].values.astype(int)
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    kmeans.fit(lotto_numbers_data)
    return kmeans

def generate_numbers_kmeans(kmeans_model, all_past_draw_details, num_to_generate=6):
    centroids = kmeans_model.cluster_centers_
    recommended_numbers_set = set()
    attempts = 0
    max_attempts = 100 

    while len(recommended_numbers_set) < num_to_generate and attempts < max_attempts:
        selected_centroid = centroids[random.randint(0, len(centroids) - 1)]
        
        candidate_numbers = sorted(list(set(
            max(1, min(45, int(round(num)))) for num in selected_centroid
        )))
        
        if len(candidate_numbers) >= num_to_generate:
            for num in random.sample(candidate_numbers, num_to_generate):
                recommended_numbers_set.add(num)
        
        attempts += 1
    
    while len(recommended_numbers_set) < num_to_generate:
        new_num = random.randint(1, 45)
        recommended_numbers_set.add(new_num)

    final_numbers = sorted(list(recommended_numbers_set))

    # 생성된 번호의 과거 적중률 계산
    historical_hit_rates = calculate_historical_matches(final_numbers, all_past_draw_details)

    return {"numbers": final_numbers, "historical_hit_rates": historical_hit_rates}


# --- 새로운: 과거 적중률 계산 함수 ---
def calculate_historical_matches(recommended_set, all_past_draw_details):
    # recommended_set: 6개의 추천 번호 (정렬된 리스트)
    # all_past_draw_details: 각 회차별 (당첨번호 6개 리스트, 보너스번호) 튜플의 리스트
    
    hit_counts = {
        "1st": 0,  # 6개 일치
        "2nd": 0,  # 5개 일치 + 보너스 번호 일치
        "3rd": 0,  # 5개 일치
        "4th": 0,  # 4개 일치
        "5th": 0   # 3개 일치
    }

    recommended_set_set = set(recommended_set) # 효율적인 비교를 위해 set으로 변환

    for winning_nums, bonus_num in all_past_draw_details:
        winning_nums_set = set(winning_nums)
        
        # 교집합 (일치하는 번호 개수) 계산
        matching_numbers = recommended_set_set.intersection(winning_nums_set)
        match_count = len(matching_numbers)

        if match_count == 6:
            hit_counts["1st"] += 1
        elif match_count == 5:
            # 5개 일치 후, 추천 번호 중 남은 1개가 보너스 번호와 일치하는지 확인 (2등 조건)
            remaining_recommended_nums = recommended_set_set - matching_numbers
            if bonus_num in remaining_recommended_nums:
                hit_counts["2nd"] += 1
            else:
                hit_counts["3rd"] += 1
        elif match_count == 4:
            hit_counts["4th"] += 1
        elif match_count == 3:
            hit_counts["5th"] += 1
            
    return hit_counts


# --- 전역 변수 초기화 (콜드 스타트 시 한 번만 실행) ---
_df_lotto_data = None
_latest_draw_number = None
_latest_draw_details = None
_frequency_data = None
_gap_data = None
_consecutive_patterns = None
_odd_even_ratios = None
_sum_ranges = None
_ending_digit_patterns = None
_kmeans_model = None 
_all_past_draw_details = [] # 모든 과거 당첨 번호와 보너스 번호를 저장할 리스트 추가

def _initialize_global_data():
    global _df_lotto_data, _latest_draw_number, _latest_draw_details, \
           _frequency_data, _gap_data, _consecutive_patterns, \
           _odd_even_ratios, _sum_ranges, _ending_digit_patterns, \
           _kmeans_model, _all_past_draw_details

    if _df_lotto_data is None: 
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

            # 모든 과거 당첨 번호와 보너스 번호를 _all_past_draw_details에 저장
            # (winning_numbers_list, bonus_number) 튜플 형태로
            _all_past_draw_details = []
            for i in range(len(_df_lotto_data)):
                try:
                    win_nums = [int(n) for n in _df_lotto_data.iloc[i, 1:7].tolist()]
                    bon_num = int(_df_lotto_data.iloc[i, 7])
                    _all_past_draw_details.append((win_nums, bon_num))
                except ValueError:
                    print(f"Skipping row {i} due to non-numeric lotto numbers.")
                    continue

            # K-means 모델 학습 및 저장
            _kmeans_model = train_kmeans_model(_df_lotto_data, n_clusters=5) 
            
            print("Global data initialization complete.")

        except Exception as e:
            print(f"Error during global data initialization: {e}")
            _df_lotto_data = pd.DataFrame() 


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

    _initialize_global_data()

    try:
        if _df_lotto_data is None or _df_lotto_data.empty:
            return (json.dumps({"error": "Lotto data not initialized or is empty."}), 500, headers)

        model_type = request.args.get('model_type', 'statistical') 
        recommended_lotto_sets_with_details = []
        num_sets_to_generate = int(request.args.get('num_sets', 1)) 

        for _ in range(num_sets_to_generate):
            if model_type == 'statistical':
                recommended_set_data = generate_numbers_stat(
                    _frequency_data, 
                    _gap_data, 
                    _consecutive_patterns, 
                    _odd_even_ratios, 
                    _sum_ranges, 
                    _ending_digit_patterns,
                    _all_past_draw_details # 과거 당첨 기록 데이터 전달
                )
                message = "Statistical Lotto Recommendation!" 
            elif model_type == 'kmeans':
                if _kmeans_model is None:
                    return (json.dumps({"error": "K-means model not initialized."}), 500, headers)
                recommended_set_data = generate_numbers_kmeans(
                    _kmeans_model,
                    _all_past_draw_details # 과거 당첨 기록 데이터 전달
                )
                message = "ML-based Lotto Recommendation!" 
            else:
                return (json.dumps({"error": f"Invalid model_type: {model_type}"}), 400, headers)
            
            recommended_lotto_sets_with_details.append(recommended_set_data)


        response_data = {
            "lotto_numbers": recommended_lotto_sets_with_details, 
            "message": message,
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
        return (json.dumps({"error": f"An unexpected error occurred: {str(e)}"}), 500, headers)

# --- 로컬 테스트를 위한 코드 ---
if __name__ == '__main__':
    print("\n--- Local Test of get_lotto_numbers function ---")
    class MockRequest:
        def __init__(self, method='GET', args=None):
            self.method = method
            self._json_data = None
            self._args = args if args is not None else {}

        def get_json(self, silent=True):
            return self._json_data

        @property
        def args(self):
            return self._args

    # Test Statistical Model
    print("\n--- Testing Statistical Model ---")
    mock_request_stat = MockRequest(args={'model_type': 'statistical', 'num_sets': '2'})
    response_body_stat, status_code_stat, response_headers_stat = get_lotto_numbers(mock_request_stat)
    print(f"Status Code (Statistical): {status_code_stat}")
    print(f"Body (Statistical): {response_body_stat}")

    # Test K-means Model
    print("\n--- Testing K-means Model ---")
    mock_request_kmeans = MockRequest(args={'model_type': 'kmeans', 'num_sets': '1'})
    response_body_kmeans, status_code_kmeans, response_headers_kmeans = get_lotto_numbers(mock_request_kmeans)
    print(f"Status Code (K-means): {status_code_kmeans}")
    print(f"Body (K-means): {response_body_kmeans}")

    try:
        if status_code_stat == 200:
            parsed_stat_response = json.loads(response_body_stat)
            if parsed_stat_response["lotto_numbers"]:
                print(f"Statistical Recommended Lotto Number 1: {parsed_stat_response['lotto_numbers'][0]['numbers']}")
                print(f"  Historical Hit Rates: {parsed_stat_response['lotto_numbers'][0]['historical_hit_rates']}")
        if status_code_kmeans == 200:
            parsed_kmeans_response = json.loads(response_body_kmeans)
            if parsed_kmeans_response["lotto_numbers"]:
                print(f"K-means Recommended Lotto Number 1: {parsed_kmeans_response['lotto_numbers'][0]['numbers']}")
                print(f"  Historical Hit Rates: {parsed_kmeans_response['lotto_numbers'][0]['historical_hit_rates']}")
    except json.JSONDecodeError:
        print("Response body is not valid JSON.")
    except Exception as e:
        print(f"Error parsing response: {e}")
