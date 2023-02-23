const fs = require("fs");
const APPID = "1008123474471814322";

/**
 * 失敗時にリトライするfetch
 */
async function fetch_retry(url, options = undefined, n = 10){
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error("FETCH RETRY");
    if (n === 1) throw err;
    return await fetch_retry(url, options, n - 1);
  }
}

/**
 * 地域コードの一覧を取得する
 */
async function getAreaCodes() {
  const response = await fetch_retry(`https://app.rakuten.co.jp/services/api/Travel/GetAreaClass/20131024?format=json&formatVersion=2&applicationId=${APPID}`);
  const json = await response.json();

  const areacodes = [];

  for(const large of json.areaClasses.largeClasses){
    const largeClassCode = large[0].largeClassCode;

    if(large[1]){
      for(const middle of large[1].middleClasses){
        const middleClassCode = middle.middleClass[0].middleClassCode;

        if(middle.middleClass[1]){
          for(const small of middle.middleClass[1].smallClasses){
            const smallClassCode = small.smallClass[0].smallClassCode;

            if(small.smallClass[1]){
              for(const detail of small.smallClass[1].detailClasses){
                const detailClassCode = detail.detailClass.detailClassCode;
                areacodes.push({ largeClassCode, middleClassCode, smallClassCode, detailClassCode });
              }
            }else{
              areacodes.push({ largeClassCode, middleClassCode, smallClassCode, detailClassCode: null });
            }
          }
        }else{
          areacodes.push({ largeClassCode, middleClassCode, smallClassCode: null, detailClassCode: null});
        }
      }
    }else{
      areacodes.push({largeClassCode, middleClassCode: null, smallClassCode: null, detailClassCode: null});
    }
  }

  return areacodes;
}

/**
 * 楽天APIが返すJSONは構造がおかしい(無駄にネストしている)ので扱いやすくする
 * @param {Object} hotel hotels配列の各要素
 */
function flattenHotelInfo_(hotel){
  const hotelinfo = {};
  for(const info of hotel){
    for(const key of Object.keys(info)){
      hotelinfo[key] = info[key];
    }
  }
  return hotelinfo;
}

/**
 * ホテル基本情報(responseType=small)を取得する
 */
async function getHotelSmallInfo(areacodes){
  const result = [];

  for(let i = 0; i < areacodes.length; i++){
    const areacode = areacodes[i];
    const large = areacode.largeClassCode;
    const middle = areacode.middleClassCode;
    const small = areacode.smallClassCode;
    const detail = areacode.detailClassCode;

    //const hits = detail ? 10: 30;
    const hits = 30;
    const parameters = [
      "format=json",
      "formatVersion=2",
      "responseType=small",
      "datumType=1",
      `applicationId=${APPID}`,
      `hits=${hits}`,
      `largeClassCode=${large}`,
      `middleClassCode=${middle}`,
      `smallClassCode=${small}`
    ];
    if(detail){
      parameters.push(`detailClassCode=${detail}`);
    }
    const url = "https://app.rakuten.co.jp/services/api/Travel/SimpleHotelSearch/20170426?" + parameters.join("&");
    
    // 1ページ目を取得
    console.log(url);
    const response1 = await fetch_retry(url);
    const json1 = await response1.json();

    //result.push(...json1.hotels);
    result.push(...(json1.hotels.map((e) => flattenHotelInfo_(e))));
    
    // 2ページ目以降を取得
    const records_total = json1.pagingInfo.recordCount;
    let records_fetched = json1.pagingInfo.last;

    while(records_total > records_fetched){
      for(let j = records_fetched + 1; j <= records_total; j += hits){
        const page = Math.ceil(j / hits);
        console.log(url + `&page=${page}`);
        const response2 = await fetch_retry(url + `&page=${page}`);
        const json2 = await response2.json();

        //result.push(...json2.hotels);
        result.push(...(json2.hotels.map((e) => flattenHotelInfo_(e))));
        records_fetched = json2.pagingInfo.last;
      }
    }
  }
  
  return result;
}

/**
 * ホテル詳細情報(responseType=large)を取得する
 */
async function getHotelLargeInfo(hotelsmallinfo){
  const N = 15;
  const result = [];
  
  for(let i = 0; i < hotelsmallinfo.length; i += N){
    const hotelNos = [];
    for(let j = 0; (j < N && i + j < hotelsmallinfo.length); j++){
      hotelNos.push(hotelsmallinfo[i + j].hotelBasicInfo.hotelNo);
    }
    console.log(JSON.stringify(hotelNos));
    const parameters = [
      "format=json",
      "formatVersion=2",
      "responseType=large",
      "datumType=1",
      `applicationId=${APPID}`,
      "hotelNo=" + hotelNos.join(",")
    ];
    const url = "https://app.rakuten.co.jp/services/api/Travel/SimpleHotelSearch/20170426?" + parameters.join("&");
    const response = await fetch_retry(url);
    const json = await response.json();

    for(let j = 0; j < json.hotels.length; j++){
      result.push(flattenHotelInfo_(json.hotels[j]));
    }
  }

  return result;
}

/**
 * 全角を半角に変換
 */
function toHalfWidth(str) {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９！-～]/g, function(s){
    return String.fromCharCode(s.charCodeAt(0)-0xFEE0);
  }).replace(/　/g, " ");
}

/**
 * 必要な情報だけ抜き出す
 */
function summarizeHotelInfo(hotellargeinfo){
  const result = [];
  for(const hotel of hotellargeinfo){
    result.push({
      hotelNo: hotel.hotelBasicInfo.hotelNo,
      hotelName: toHalfWidth(hotel.hotelBasicInfo.hotelName),
      latitude: hotel.hotelBasicInfo.latitude,
      longitude: hotel.hotelBasicInfo.longitude,
      checkinTime: hotel.hotelDetailInfo.checkinTime,
      lastCheckinTime: hotel.hotelDetailInfo.lastCheckinTime,
      laundry: hotel.hotelFacilitiesInfo.hotelFacilities.some((e) => e.item.match(/コインランドリー/))
    });
  }
  
  return result;
}

/**
 * メイン
 */
(async function(){
  const areacodes = await getAreaCodes();
  const hotelsmallinfo = await getHotelSmallInfo(areacodes);
  const hotellargeinfo = await getHotelLargeInfo(hotelsmallinfo);
  const summary = summarizeHotelInfo(hotellargeinfo);

  fs.writeFileSync("hotel_info_all.json", JSON.stringify(hotellargeinfo));
  fs.writeFileSync("hotel_info_summary.json", JSON.stringify(summary));
})();
