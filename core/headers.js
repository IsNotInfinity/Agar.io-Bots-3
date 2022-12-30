module.exports = function (host) {
    let headers = {
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "es-419,es;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "Upgrade",
        "Host": host,
        "Origin": "https://agar.io",
        "Pragma": "no-cache",
        "Upgrade": "websocket",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    };
    return headers;
};