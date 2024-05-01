#!/bin/bash
# ローカルの開発用に最新データをダウンロード

wget 'https://330k.github.io/rakuten-hotel-search/hotel_info_summary.json' -O hotel_info_summary.json
wget 'https://330k.github.io/rakuten-hotel-search/hotel_info_all.json.gz' -O hotel_info_all.json.gz
