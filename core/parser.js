module.exports = function (gameIP) {
    return gameIP.replace(/(wss:\/\/)/, '').toString().replace(/[?]party_id=(\w+)/, '').toString().replace(/(\/)/, '').toString().replace(/(:443)/, '');
};