import pandas as pd
from collections import Counter
import random
import os
import json # JSON 모듈 추가 (API 응답을 위해 필요)

# --- 데이터 로드 함수 (Cloud Functions 환경에 맞춰 수정 필요) ---
def load_lotto_data():
    # Cloud Functions 환경에서는 lotto.csv가 함수 코드와 함께 배포될 것입니다.
    # 따라서 함수가 실행되는 디렉토리에서 lotto.csv를 찾아야 합니다.
    # 'data' 폴더 안에 있다면 'data/lotto.csv' 경로를 사용합니다.
    # Colab에서 테스트할 때는 'lotto-recommender-app/data/lotto.csv' 경로를 사용합니다.

    # Cloud Functions 환경과 로컬(Colab) 환경을 구분하기 위한 간단한 로직
    # 실제 Cloud Functions에 배포될 때는 'data/lotto.csv'가 올바른 경로가 됩니다.
    if os.path.exists('data/lotto.csv'): # Cloud Functions 환경 예상
        csv_path = 'data/lotto.csv'
    elif os.path.exists('lotto-recommender-app/data/lotto.csv'): # Colab 환경 예상
        csv_path = 'lotto-recommender-app/data/lotto.csv'
    else:
        # 파일을 찾을 수 없을 때의 오류 처리
        raise FileNotFoundError("lotto.csv not found in expected locations.")

    # 수정된 부분: sep=r'\s+' 대신 sep=',' 사용
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
    # 인덱싱이 [0, 1, 2, 3, 4, 5]로 고정되어 있으므로,
    # df_lotto_original의 첫 6개 컬럼이 로또 번호임을 가정합니다.
    # 만약 데이터에 따라 컬럼 인덱스가 달라질 수 있다면 이 부분을 유동적으로 변경해야 합니다.
    latest_draw_numbers = df_lotto_original.iloc[0, [0, 1, 2, 3, 4, 5]].tolist()
    gap_data = {}
    for num in range(1, 46):
        found_in_draw = -1
        for i in range(len(df_lotto_original)):
            draw_numbers = df_lotto_original.iloc[i, [0, 1, 2, 3, 4, 5]].tolist()
            try:
                draw_numbers = [int(n) for n in draw_numbers]
            except ValueError:
                # 숫자로 변환할 수 없는 값이 있으면 해당 줄은 건너뜀
                continue
            if num in draw_numbers:
                found_in_draw = i
                break
        if found_in_draw != -1:
            gap = found_in_draw
        else:
            gap = len(df_lotto_original)
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
# HTTP 요청을 처리하는 메인 함수. Google Cloud Functions는 이 함수를 호출합니다.
def get_lotto_numbers(request):
    # CORS(Cross-Origin Resource Sharing) 설정
    # 웹 브라우저에서 다른 도메인의 API를 호출할 때 필요합니다.
    headers = {
        'Access-Control-Allow-Origin': '*', # 모든 도메인에서 접근 허용 (개발 단계에서 편리, 실제 서비스에서는 특정 도메인만 허용하는 것이 보안에 좋음)
        'Access-Control-Allow-Methods': 'GET', # 허용할 HTTP 메서드 (GET 요청만 가능하도록)
        'Access-Control-Allow-Headers': 'Content-Type', # 허용할 헤더
        'Access-Control-Max-Age': '3600' # Preflight 요청 결과 캐싱 시간
    }

    # Preflight request (OPTIONS 메서드) 처리
    # 브라우저가 실제 요청을 보내기 전에 서버에 권한을 묻는 요청입니다.
    if request.method == 'OPTIONS':
        return ('', 204, headers) # 204 No Content, 성공적인 응답

    try:
        # 실제 로또 데이터 로드
        df_lotto_data = load_lotto_data()

        # 데이터가 비어있을 경우 오류 처리
        if df_lotto_data.empty:
            return (json.dumps({"error": "Failed to load lotto data: DataFrame is empty."}), 500, headers)

        # 통계 데이터 계산을 위한 컬럼 선택
        # lotto.csv가 쉼표로 구분되어 여러 컬럼으로 들어왔지만,
        # 로또 번호는 항상 첫 6개 컬럼에 있을 것이라고 가정합니다.
        # 따라서 [0, 1, 2, 3, 4, 5] 인덱스를 그대로 사용합니다.
        lotto_numbers_columns_for_calc = [0, 1, 2, 3, 4, 5]
        df_lotto_for_calc = df_lotto_data[lotto_numbers_columns_for_calc]

        # calc_frequency와 calc_gap 함수 호출
        frequency_data = calc_frequency(df_lotto_for_calc)
        gap_data = calc_gap(df_lotto_data) # calc_gap은 원본 df_lotto를 사용

        # 최종 로또 번호 생성
        recommended_numbers = generate_numbers_stat(frequency_data, gap_data)

        # JSON 형식으로 결과 반환
        response_data = {"lotto_numbers": recommended_numbers, "message": "로또 추천 번호입니다!"} # 성공 메시지 추가
        return (json.dumps(response_data), 200, headers) # 200 OK, 성공적인 응답

    except FileNotFoundError as e:
        return (json.dumps({"error": f"File not found: {str(e)}"}), 500, headers)
    except IndexError as e:
        # 데이터프레임 인덱싱 오류 발생 시 (예: 컬럼이 충분하지 않을 때)
        return (json.dumps({"error": f"Data indexing error, check lotto.csv format: {str(e)}"}), 500, headers)
    except Exception as e:
        # 예상치 못한 다른 오류 발생 시
        return (json.dumps({"error": f"An unexpected error occurred: {str(e)}"}), 500, headers)


# --- 로컬 테스트를 위한 코드 (Colab이나 로컬 Python 환경에서 직접 실행해볼 때) ---
if __name__ == '__main__':
    print("\n--- 로컬에서 get_lotto_numbers 함수 테스트 ---")
    # Flask request 객체를 모방한 더미 객체 생성 (Cloud Functions 환경을 시뮬레이션)
    class MockRequest:
        def __init__(self, method='GET'):
            self.method = method

    mock_request = MockRequest()
    response_body, status_code, response_headers = get_lotto_numbers(mock_request)

    print(f"Status Code: {status_code}")
    print(f"Headers: {response_headers}")
    print(f"Body: {response_body}")

    try:
        # JSON 응답을 파싱하여 실제 추천 번호 확인
        parsed_response = json.loads(response_body)
        if "lotto_numbers" in parsed_response:
            print(f"추천 로또 번호: {parsed_response['lotto_numbers']}")
        elif "error" in parsed_response: # 오류 메시지도 출력
            print(f"오류: {parsed_response['error']}")
    except json.JSONDecodeError:
        print("응답 바디가 JSON 형식이 아닙니다.")
    except Exception as e:
        print(f"응답 파싱 중 오류 발생: {e}")