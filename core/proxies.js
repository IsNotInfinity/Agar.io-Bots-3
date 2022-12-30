const agent = require('https-proxy-agent');
const fs = require('fs');

module.exports = class {
    constructor() {
        this.proxyList = fs.readFileSync('./proxies.txt')
        .toString()
        .split('\n')
        .map(proxy => proxy.replace('\r', ''));
        this.index = 0;
        this.proxies = [];
        this.parseProxies();
    };

    parseProxies() {
        for(let i = 0; i < this.proxyList.length; i++) {
            const proxy = this.proxyList[i];
            this.proxies.push(`http://${proxy}`);
        };
    };

    getProxy() {
        if(this.index >= this.proxies.length) this.index = 0;
        return new agent(this.proxies[this.index++]);
    };

};