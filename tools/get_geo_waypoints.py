import requests
import json

def fetch_coastline_as_waypoints(min_lat, min_lon, max_lat, max_lon):
    """
    Overpass APIを使用して海岸線を取得し、Waypoint形式のリストを返します。
    """
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    # [out:json] 形式で海岸線 (natural=coastline) を取得するクエリ
    query = f"""
    [out:json][timeout:25];
    (
      way["natural"="coastline"]({min_lat}, {min_lon}, {max_lat}, {max_lon});
    );
    out geom;
    """
    
    response = requests.get(overpass_url, params={'data': query})
    data = response.json()
    
    all_segments = []
    
    # OpenStreetMapの 'way' 要素（線分）をループ
    for way in data.get('elements', []):
        waypoints = []

        # 線を構成する各座標点を抽出
        for i, point in enumerate(way.get('geometry', [])):
            waypoints.append({
                "lat": point['lat'],
                "lon": point['lon']
            })
        
        all_segments.append(waypoints)
            
    return all_segments

# --- 実行例 ---
# 羽田空港を中心とした東京湾周辺の範囲
# (南端, 西端, 北端, 東端)
bbox_haneda = (34.2, 138.1, 36.9, 141.4)

coast_data = fetch_coastline_as_waypoints(*bbox_haneda)

# TypeScript形式のJSONとして出力
print(json.dumps(coast_data, indent=2))