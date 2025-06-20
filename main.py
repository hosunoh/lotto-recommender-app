import pandas as pd
from collections import Counter
import random
import os
import json
from sklearn.cluster import KMeans # KMeans 모델 추가
import numpy as np # 넘파이 추가

# --- 데이터 로드 함수 ---
def load_lotto_data():
    # Cloud Functions 환경에서는 lotto.csv가 함수 코드와 함께 배포될 것입니다.
    # 따라서 함수가 실행되는 디렉토리에서 lotto.csv를 찾아야 합니다.
    # 'data' 폴더 안에 있다면 'data/lotto.csv' 경로를 사용합니다.
    # Colab에서 테스트할 때는 'lotto-recommender-app/data/lotto.csv' 경로를 사용합니다.

    if os.path.exists('data/lotto.csv'): # Cloud Functions 환경 예상
        csv_path = 'data/lotto.csv'
    elif os.path.exists('lotto-recommender-app/data/lotto.csv'): # Colab 환경 예상
        csv_path = 'lotto-recommender-app/data/lotto.csv'
    else:
        raise FileNotFoundError("lotto.csv not found in expected locations.")

    # sep=',' 사용하여 쉼표 구분 파일 읽기
    # header=None은 첫 줄을 헤더로 인식하지 않도록 함
    df_lotto = pd.read_csv(csv_path, header=None, sep=',')
    return df_lotto

# --- 기존 통계 함수 ---
def calc_frequency(df_numbers):
    # df_numbers는 이미 로또 번호 6개 컬럼만 포함한다고 가정
    df_numbers_numeric = df_numbers.apply(pd.to_numeric, errors='coerce')
    all_numbers = df_numbers_numeric.values.flatten()
    all_numbers = all_numbers[~pd.isna(all_numbers)]
    all_numbers = all_numbers.astype(int)
    frequency = Counter(all_numbers)
    return frequency

def calc_gap(df_lotto_original):
    # df_lotto_original은 회차 포함 전체 데이터프레임
    # 로또 번호 컬럼은 인덱스 1부터 6까지
    if df_lotto_original.empty or len(df_lotto_original.columns) < 7: # 최소 7개 컬럼 (회차 + 6개 번호) 확인
        raise ValueError("Lotto data format is incorrect for gap calculation.")

    gap_data = {}
    num_rows = len(df_lotto_original)
    
    # 각 번호(1~45)에 대해 간격 계산
    for num in range(1, 46): # 로또 번호 범위 1~45
        found_at_draw_index = -1 # 번호가 발견된 행 인덱스 (0부터 시작)

        # 최신 회차 (마지막 행: num_rows - 1)부터 과거로 거슬러 올라가며 탐색
        for i in range(num_rows - 1, -1, -1): # i는 num_rows-1 부터 0까지 역순으로
            # 당첨 번호 컬럼: [1, 2, 3, 4, 5, 6]
            draw_numbers = df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()
            try:
                draw_numbers = [int(n) for n in draw_numbers]
            except ValueError:
                continue # 숫자로 변환할 수 없는 값은 건너김
            if num in draw_numbers:
                found_at_draw_index = i
                break # 찾으면 가장 최근 출현 회차이므로 중단
        
        # 간격 계산: (가장 최신 회차의 인덱스) - (발견된 회차의 인덱스)
        if found_at_draw_index != -1:
            gap = (num_rows - 1) - found_at_draw_index 
        else:
            gap = num_rows # 전체 회차 동안 나오지 않았으면 전체 길이(총 회차 수)를 간격으로 설정
        gap_data[num] = gap
    return gap_data

# --- 통계 패턴 분석 함수들 (이전과 동일) ---
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

def analyze_ending_digit_patterns(df_lotto_original):
    ending_digit_counts = Counter()
    total_draws = len(df_lotto_original)

    for i in range(total_draws):
        draw_numbers = [int(n) for n in df_lotto_original.iloc[i, [1, 2, 3, 4, 5, 6]].tolist()]
        digits = [num % 10 for num in draw_numbers] # 끝자리 추출
        ending_digit_counts[tuple(sorted(digits))] += 1 # 정렬된 튜플로 패턴 저장
    
    # 각 끝자리 패턴이 나타난 빈도를 백분율로 반환
    return {k: v / total_draws if total_draws > 0 else 0 for k, v in ending_digit_counts.items()}


# --- 추천 번호 생성 함수 (고도화 통계 모델) ---
def generate_numbers_stat(frequency_data, gap_data, consecutive_patterns, odd_even_ratios, sum_ranges, ending_digit_patterns, num_to_generate=6):
    recommended_numbers = set()
    number_scores = {}
    
    for num in range(1, 46):
        freq = frequency_data.get(num, 0)
        gap = gap_data.get(num, 0)
        score = freq + (gap * 2) # 기존 점수 계산
        number_scores[num] = score
    
    sorted_numbers_by_score = sorted(number_scores.items(), key=lambda item: item[1], reverse=True)
    top_candidates = [num for num, score in sorted_numbers_by_score[:20]] 

    # Note: Pattern considerations are currently implemented as a general guideline
    # for selecting numbers from top_candidates, rather than a strict filter for every single generated set.
    # The final scoring of pattern adherence is for informational purposes or further refinement.
    
    while len(recommended_numbers) < num_to_generate:
        if not top_candidates:
            remaining_numbers = list(set(range(1, 46)) - recommended_numbers)
            if not remaining_numbers: break
            chosen = random.choice(remaining_numbers)
        else:
            chosen = random.choice(top_candidates)
            top_candidates.remove(chosen) # 중복 선택 방지

        recommended_numbers.add(chosen)
        
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
    if (current_sum >= 80 and current_sum <= 150): # 목표 합계 범위 내 (80-150)
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
    if max_consecutive <= 2: # 목표 연속 번호 개수 이하 (0~2개 연속)
        consecutive_score += 10

    # 이 패턴 점수들을 어떻게 활용할지는 결정 필요 (예: 다시 뽑기, 사용자에게 정보 제공 등)
    # 현재는 번호 선택에 직접 반영하지 않고, 로직에 대한 이해를 돕기 위해 추가

    return final_numbers


# --- 새로운 K-means 모델 관련 함수 ---
def train_kmeans_model(df_lotto_original, n_clusters=5):
    # 로또 번호 6개 컬럼만 선택하여 학습 데이터 준비
    # 번호의 스케일을 조정 (예: Min-Max Scaling)하면 K-means 성능 향상에 도움이 될 수 있음
    # 여기서는 간단하게 번호 자체를 사용
    lotto_numbers_data = df_lotto_original.iloc[:, 1:7].values.astype(int)
    
    # KMeans 모델 학습
    # random_state를 고정하여 결과의 재현성 확보
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10) # n_init 추가
    kmeans.fit(lotto_numbers_data)
    return kmeans

def generate_numbers_kmeans(kmeans_model, num_to_generate=6):
    # 학습된 클러스터 중심(centroids) 중 하나를 선택
    # 가장 가까운 정수로 반올림하여 로또 번호로 사용
    # 중복 및 1-45 범위 벗어나는 경우 처리 필요

    # 클러스터 중심 (실수 형태)
    centroids = kmeans_model.cluster_centers_

    recommended_numbers_set = set()
    attempts = 0
    max_attempts = 100 # 무한 루프 방지

    while len(recommended_numbers_set) < num_to_generate and attempts < max_attempts:
        # 무작위로 클러스터 중심 하나를 선택
        selected_centroid = centroids[random.randint(0, len(centroids) - 1)]
        
        # 중심 값을 반올림하여 로또 번호로 변환
        # 번호 범위 (1-45) 및 중복 처리
        candidate_numbers = sorted(list(set(
            max(1, min(45, int(round(num)))) for num in selected_centroid
        )))
        
        # 6개의 고유한 번호가 생성되었는지 확인
        if len(candidate_numbers) >= num_to_generate:
            # 원하는 개수만큼 번호 선택
            # random.sample은 중복 없이 선택
            for num in random.sample(candidate_numbers, num_to_generate):
                recommended_numbers_set.add(num)
        
        attempts += 1
    
    # 마지막까지 6개를 채우지 못했으면, 부족한 만큼 랜덤 번호 추가
    while len(recommended_numbers_set) < num_to_generate:
        new_num = random.randint(1, 45)
        recommended_numbers_set.add(new_num)

    return sorted(list(recommended_numbers_set))


# --- 전역 변수 초기화 (콜드 스타트 시 한 번만 실행) ---
# Cloud Functions 인스턴스가 로드될 때 한 번만 실행되어 성능 향상
_df_lotto_data = None
_latest_draw_number = None
_latest_draw_details = None
_frequency_data = None
_gap_data = None
_consecutive_patterns = None
_odd_even_ratios = None
_sum_ranges = None
_ending_digit_patterns = None
_kmeans_model = None # K-means 모델 전역 변수 추가

def _initialize_global_data():
    global _df_lotto_data, _latest_draw_number, _latest_draw_details, \
           _frequency_data, _gap_data, _consecutive_patterns, \
           _odd_even_ratios, _sum_ranges, _ending_digit_patterns, \
           _kmeans_model

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

            # K-means 모델 학습 및 저장
            # 클러스터 개수는 데이터 특성이나 실험을 통해 최적값 결정 필요
            # 여기서는 임시로 5개 클러스터 사용
            _kmeans_model = train_kmeans_model(_df_lotto_data, n_clusters=5) 
            
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

    _initialize_global_data()

    try:
        if _df_lotto_data is None or _df_lotto_data.empty:
            return (json.dumps({"error": "Lotto data not initialized or is empty."}), 500, headers)

        # 요청 쿼리 파라미터에서 모델 타입 확인
        model_type = request.args.get('model_type', 'statistical') # 기본값은 'statistical'

        recommended_numbers = []
        if model_type == 'statistical':
            recommended_numbers = generate_numbers_stat(
                _frequency_data, 
                _gap_data, 
                _consecutive_patterns, 
                _odd_even_ratios, 
                _sum_ranges, 
                _ending_digit_patterns
            )
            message = "통계 기반 로또 추천 번호입니다!"
        elif model_type == 'kmeans':
            if _kmeans_model is None:
                 return (json.dumps({"error": "K-means model not initialized."}), 500, headers)
            recommended_numbers = generate_numbers_kmeans(_kmeans_model)
            message = "K-means 기반 로또 추천 번호입니다!"
        else:
            return (json.dumps({"error": f"Invalid model_type: {model_type}"}), 400, headers)


        response_data = {
            "lotto_numbers": recommended_numbers,
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
        # 예상치 못한 다른 오류 발생 시, 초기화 오류도 포함될 수 있음
        return (json.dumps({"error": f"An unexpected error occurred: {str(e)}"}), 500, headers)

# --- 로컬 테스트를 위한 코드 ---
if __name__ == '__main__':
    print("\n--- 로컬에서 get_lotto_numbers 함수 테스트 (Statistical) ---")
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

    # 통계 모델 테스트
    mock_request_stat = MockRequest(args={'model_type': 'statistical'})
    response_body_stat, status_code_stat, response_headers_stat = get_lotto_numbers(mock_request_stat)
    print(f"Status Code (Statistical): {status_code_stat}")
    print(f"Body (Statistical): {response_body_stat}")

    print("\n--- 로컬에서 get_lotto_numbers 함수 테스트 (K-means) ---")
    # K-means 모델 테스트
    mock_request_kmeans = MockRequest(args={'model_type': 'kmeans'})
    response_body_kmeans, status_code_kmeans, response_headers_kmeans = get_lotto_numbers(mock_request_kmeans)
    print(f"Status Code (K-means): {status_code_kmeans}")
    print(f"Body (K-means): {response_body_kmeans}")

    try:
        if status_code_kmeans == 200:
            parsed_kmeans_response = json.loads(response_body_kmeans)
            if "lotto_numbers" in parsed_kmeans_response:
                print(f"K-means 추천 로또 번호: {parsed_kmeans_response['lotto_numbers']}")
    except json.JSONDecodeError:
        print("K-means 응답 바디가 JSON 형식이 아닙니다.")
    except Exception as e:
        print(f"K-means 응답 파싱 중 오류 발생: {e}")
