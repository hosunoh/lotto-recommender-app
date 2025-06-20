import pandas as pd
from collections import Counter
import random
import os
import json

# --- 데이터 로드 함수 (Cloud Functions 환경에 맞춰 수정 필요) ---
def load_lotto_data():
    if os.path.exists('data/lotto.csv'):
        csv_path = 'data/lotto.csv'
    elif os.path.exists('lotto-recommender-app/data/lotto.csv'):
        csv_path = 'lotto-recommender-app/data/lotto.csv'
    else:
        raise FileNotFoundError("lotto.csv not found in expected locations.")

    df_lotto = pd.read_csv(csv_path, header=None, sep=',')
    return df_lotto

# --- 기존에 구현한 함수들 (calc_frequency, calc_gap, generate_numbers_stat) ---
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

def generate_numbers_stat(frequency_data, gap_data, num_to_generate=6):
    recommended_numbers = set()
    number_scores = {}
    for num in range(1, 46):
        freq = frequency_data.get(num, 0)
        gap = gap_data.get(num, 0)
        score = freq + (gap * 2)
        number_scores[num] = score

    sorted_numbers_by_score = sorted(number_scores.items(), key=lambda item: item[1], reverse=True)
    top_score_candidates = [num for num, score in sorted_numbers_by_score[:15]]

    while len(recommended_numbers) < num_to_generate and top_score_candidates:
        chosen = random.choice(top_score_candidates)
        recommended_numbers.add(chosen)
        top_score_candidates.remove(chosen)

    all_possible_numbers = set(range(1, 46))
    remaining_numbers = list(all_possible_numbers - recommended_numbers)

    while len(recommended_numbers) < num_to_generate:
        if not remaining_numbers:
            break
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
        latest_draw_number = int(df_lotto_data.iloc[-1, 0])
        
        # 최신 회차의 당첨 번호, 보너스 번호, 당첨금 정보 추출 (마지막 행)
        latest_draw_row = df_lotto_data.iloc[-1].tolist()
        
        # 당첨 번호 6개 (인덱스 1~6)
        winning_numbers = [int(n) for n in latest_draw_row[1:7]]
        # 보너스 번호 (인덱스 7)
        bonus_number = int(latest_draw_row[7])
        
        # 당첨금 정보 (인덱스 9부터 13까지)
        # 해당 컬럼들이 숫자로 파싱 가능한지 확인
        prizes = {
            "1st": int(latest_draw_row[9]) if len(latest_draw_row) > 9 and pd.notna(latest_draw_row[9]) else None,
            "2nd": int(latest_draw_row[10]) if len(latest_draw_row) > 10 and pd.notna(latest_draw_row[10]) else None,
            "3rd": int(latest_draw_row[11]) if len(latest_draw_row) > 11 and pd.notna(latest_draw_row[11]) else None,
            "4th": int(latest_draw_row[12]) if len(latest_draw_row) > 12 and pd.notna(latest_draw_row[12]) else None,
            "5th": int(latest_draw_row[13]) if len(latest_draw_row) > 13 and pd.notna(latest_draw_row[13]) else None,
        }
        
        # 통계 데이터 계산을 위한 로또 번호 컬럼 선택 (인덱스 1부터 6까지)
        lotto_numbers_columns_for_calc = [1, 2, 3, 4, 5, 6]
        df_lotto_for_calc = df_lotto_data[lotto_numbers_columns_for_calc].copy()

        # calc_frequency와 calc_gap 함수 호출
        frequency_data = calc_frequency(df_lotto_for_calc)
        gap_data = calc_gap(df_lotto_data)

        # 최종 로또 번호 생성
        recommended_numbers = generate_numbers_stat(frequency_data, gap_data)

        # JSON 형식으로 결과 반환
        response_data = {
            "lotto_numbers": recommended_numbers,
            "message": "로또 추천 번호입니다!",
            "latest_draw_number": latest_draw_number,
            "latest_draw_details": { # 최신 당첨 내용 추가
                "winning_numbers": winning_numbers,
                "bonus_number": bonus_number,
                "prizes": prizes
            }
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
