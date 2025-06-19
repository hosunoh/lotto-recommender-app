import pandas as pd
from collections import Counter
import random
import os
import json

# --- 데이터 로드 함수 (Cloud Functions 환경에 맞춰 수정 필요) ---
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

# --- 기존에 구현한 함수들 (calc_frequency, calc_gap, generate_numbers_stat) ---
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
    num_rows = len(df_lotto_original) # 총 회차 수
    
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

def generate_numbers_stat(frequency_data, gap_data, num_to_generate=6):
    recommended_numbers = set()
    number_scores = {}
    for num in range(1, 46):
        freq = frequency_data.get(num, 0)
        gap = gap_data.get(num, 0)
        score = freq + (gap * 2) # 빈도와 간격을 이용한 점수 계산
        number_scores[num] = score

    # 점수가 높은 순으로 정렬하여 상위 15개 후보군 선택
    sorted_numbers_by_score = sorted(number_scores.items(), key=lambda item: item[1], reverse=True)
    top_score_candidates = [num for num, score in sorted_numbers_by_score[:15]]

    # 상위 후보군에서 무작위로 6개 선택 (중복 없이)
    while len(recommended_numbers) < num_to_generate and top_score_candidates:
        chosen = random.choice(top_score_candidates)
        recommended_numbers.add(chosen)
        top_score_candidates.remove(chosen) # 선택된 번호는 후보군에서 제거

    # 만약 상위 후보군만으로는 6개를 채우지 못했다면, 나머지 번호 중에서 무작위로 추가
    all_possible_numbers = set(range(1, 46))
    remaining_numbers = list(all_possible_numbers - recommended_numbers)

    while len(recommended_numbers) < num_to_generate:
        if not remaining_numbers:
            break # 더 이상 추가할 번호가 없으면 종료
        chosen = random.choice(remaining_numbers)
        recommended_numbers.add(chosen)
        remaining_numbers.remove(chosen)

    return sorted(list(recommended_numbers))

# --- Cloud Functions 진입점 (Entry Point) ---
def get_lotto_numbers(request):
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
    }

    if request.method == 'OPTIONS':
        return ('', 204, headers)

    try:
        df_lotto_data = load_lotto_data()

        if df_lotto_data.empty:
            return (json.dumps({"error": "Failed to load lotto data: DataFrame is empty."}), 500, headers)

        # 최신 회차 번호 추출 (마지막 행, 첫 번째 컬럼)
        # lotto.csv 파일의 마지막 행, 첫 번째 컬럼(인덱스 0)이 최신 회차 번호라고 가정
        latest_draw_number = int(df_lotto_data.iloc[-1, 0])

        # 통계 데이터 계산을 위한 로또 번호 컬럼 선택 (인덱스 1부터 6까지)
        lotto_numbers_columns_for_calc = [1, 2, 3, 4, 5, 6]
        # .copy()를 사용하여 SettingWithCopyWarning 방지
        df_lotto_for_calc = df_lotto_data[lotto_numbers_columns_for_calc].copy()

        # calc_frequency와 calc_gap 함수 호출
        frequency_data = calc_frequency(df_lotto_for_calc)
        gap_data = calc_gap(df_lotto_data) # calc_gap은 원본 df_lotto를 사용

        # 최종 로또 번호 생성
        recommended_numbers = generate_numbers_stat(frequency_data, gap_data)

        # JSON 형식으로 결과 반환
        response_data = {
            "lotto_numbers": recommended_numbers,
            "message": "로또 추천 번호입니다!",
            "latest_draw_number": latest_draw_number # 최신 회차 번호 추가
        }
        return (json.dumps(response_data), 200, headers)

    except FileNotFoundError as e:
        return (json.dumps({"error": f"File not found: {str(e)}"}), 500, headers)
    except IndexError as e:
        return (json.dumps({"error": f"Data indexing error, check lotto.csv format (expected at least 7 columns including draw number): {str(e)}"}), 500, headers)
    except ValueError as e:
        return (json.dumps({"error": f"Data conversion error, check lotto.csv content: {str(e)}"}), 500, headers)
    except Exception as e:
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
        elif "error" in parsed_response:
            print(f"오류: {parsed_response['error']}")
    except json.JSONDecodeError:
        print("응답 바디가 JSON 형식이 아닙니다.")
    except Exception as e:
        print(f"응답 파싱 중 오류 발생: {e}")
