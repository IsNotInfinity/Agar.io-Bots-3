const WebSocket = require('ws');
const Reader = require('./core/reader.js');
const Entity = require('./core/entity.js');
const proxyHandler = require('./core/proxies.js');
const randomName = require('random-array-picker');
const parseIP = require('./core/parser.js');
const getHeaders = require('./core/headers.js');
const algorithm = require('./core/algorithm.js');
const buffers = require('./core/buffers.js');

let botsConfig = {
    protocol: 0,
    client: 0,
    mouseX: 0,
    mouseY: 0,
    followMouse: false,
    proxyHandler: new proxyHandler(),
    startBots: function (gameIP, name, count) {
        let index = 0;
        setInterval(() => {
            if(index < this.proxyHandler.proxies.length) {
                botsConfig.bots.push(new Bot(gameIP, name));
            index++;
            };
        }, 10);
    },
    spawnedBots: 0,
    bots: [],
};

class Bot {
    constructor(gameIP, name, token) {
        this.name = randomName(['cia', 'pokerface', 'sir', 'stalin', 'wojak', 'yaranaika']);
        this.token = token;
        this.gameIP = gameIP;
        this.parsedGameIp = parseIP(this.gameIP);
        this.encryptionKey = 0;
        this.decryptionKey = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.gotMapSize = false;
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.isAlive = false;
        this.botMoveInterval = null;
        this.botCellsIDs = [];
        this.viewportEntities = {};
        this.ws = null;
        this.connect();
    };

    connect() {
        this.ws = new WebSocket(this.gameIP, {
            agent: botsConfig.proxyHandler.getProxy(),
            headers: getHeaders(this.parsedGameIp),
            rejectUnauthorized: false,
        });
        this.ws.binaryType = 'arraybuffer';
        this.ws.onopen = this.onBotConnected.bind(this);
        this.ws.onmessage = this.onBotMessage.bind(this);
        this.ws.onerror = this.onBotError.bind(this);
        this.ws.onclose = this.onBotClose.bind(this);
    };

    reconnect() {
        this.encryptionKey = 0;
        this.decryptionKey = 0;
        this.isAlive = false;
        this.botMoveInterval = null;
        this.viewportEntities = {};
        this.botCellsIDs = [];
        this.ws = null;
        this.connect();
    };

    send(buffer) {
        if(!this.ws) return;
        if(this.encryptionKey) {
            buffer = algorithm.rotateBufferBytes(buffer.buffer, this.encryptionKey);
            this.encryptionKey = algorithm.rotateEncryptionKey(this.encryptionKey);
        };
        if(this.ws.readyState === 1) this.ws.send(buffer);
    };

    onBotConnected() {
        this.send(buffers.protocol(botsConfig.protocol));
        this.send(buffers.client(botsConfig.client));
        console.log('Bot Connected!');
    };

    onBotMessage(data) {
        if(this.decryptionKey) {
            let reader = new Reader(algorithm.rotateBufferBytes(data.data, this.decryptionKey ^ botsConfig.client), true);
            switch(reader.readUint8()) {
                case 18: {
                    setTimeout(() => {
                        this.ws.close();
                    }, 1000);
                    break;
                };
                case 32: {
                    this.botCellsIDs.push(reader.readUint32());
                    if(!this.isAlive) {
                        this.isAlive = true;
                        this.botMoveInterval = setInterval(() => {
                            this.move();
                        }, 40);
                        botsConfig.spawnedBots++;
                    };
                    break;
                };
                case 242: {
                    this.send(buffers.spawn(this.name));
                    break;
                };
                case 255: {
                    const buffer = algorithm.uncompressBuffer(new Uint8Array(reader.dataView.buffer.slice(5)), new Uint8Array(reader.readUint32()));
                    reader = new Reader(buffer.buffer, true);
                    switch(reader.readUint8()) {
                        case 16: {
                            const eatRecordLength = reader.readUint16()
                            for(let i = 0; i < eatRecordLength; i++) reader.byteOffset += 8;
                            while(true) {
                                const id = reader.readUint32();
                                if(id === 0) break;
                                const entity = new Entity();
                                entity.id = id;
                                entity.x = reader.readInt32();
                                entity.y = reader.readInt32();
                                entity.size = reader.readUint16();
                                const flags = reader.readUint8();
                                const extendedFlags = flags & 128 ? reader.readUint8() : 0;
                                if(flags & 1) entity.isVirus = true;
                                if(flags & 2) reader.byteOffset += 3;
                                if(flags & 4) entity.skin = reader.readString();
                                if(flags & 8) entity.name = reader.readString();
                                if(extendedFlags & 1) entity.isPellet = true;
                                if(extendedFlags & 2) entity.isFriend = true;
                                if(extendedFlags & 4) reader.byteOffset += 4;
                                this.viewportEntities[entity.id] = entity;
                            };
                            const removeRecordLength = reader.readUint16();
                            for(let i = 0; i < removeRecordLength; i++) {
                                const removedEntityID = reader.readUint32();
                                if(this.botCellsIDs.includes(removedEntityID)) this.botCellsIDs.splice(this.botCellsIDs.indexOf(removedEntityID), 1);
                                delete this.viewportEntities[removedEntityID];
                            };

                            if(this.isAlive && this.botCellsIDs.length === 0) {
                                this.isAlive = false;
                                setTimeout(() => {
                                    this.send(buffers.spawn(this.name));
                                }, 2000);
                                botsConfig.spawnedBots--;
                            };

                            console.log(botsConfig.spawnedBots);

                            break;
                        };
                        case 64: {
                            const left = reader.readFloat64();
                            const top = reader.readFloat64();
                            const right = reader.readFloat64();
                            const bottom = reader.readFloat64();
                            if(!this.gotMapSize) {
                                this.gotMapSize = true;
                                this.mapWidth = ~~(right - left);
                                this.mapHeight = ~~(bottom - top);
                            };
                            if(~~(right - left) === this.mapWidth && ~~(bottom - top) === this.mapHeight) {
                                this.offsetX = (right + left) / 2;
                                this.offsetY = (bottom + top) / 2;
                            };
                        };
                    };
                    break;
                };
            };
        } else {
            const reader = new Reader(data.data, true);
            if(reader.readUint8() === 241 && reader.dataView.byteLength === 12) {
                this.decryptionKey = reader.readUint32();
                this.encryptionKey = algorithm.murmur2(`${this.parsedGameIp}${reader.readString()}`, 255);
            };
        };
    };

    onBotError() {
        setTimeout(() => {
            this.ws.close();
        }, 1000);
    };

    onBotClose() {
        setTimeout(() => {
            this.reconnect();
        }, 1000);
    };

    calculateDistance(botX, botY, targetX, targetY) {
        return Math.hypot(targetX - botX, targetY - botY);
    };    

    getClosestEntity(type, botX, botY, botSize) {
        let closestDistance = Infinity;
        let closestEntity = null;
        for (const entity of Object.values(this.viewportEntities)) {
            let isConditionMet = false;
            switch (type) {
                case 'biggerPlayer': {
                    isConditionMet = !entity.isVirus && !entity.isPellet && !entity.isFriend && entity.size > botSize * 1.15 && entity.name !== this.name;
                    break;
                };
                case 'smallerPlayer': {
                    isConditionMet = !entity.isVirus && !entity.isPellet && !entity.isFriend && entity.size < botSize && entity.name !== this.name;
                    break;
                };
                case 'pellet': {
                    isConditionMet = !entity.isVirus && !entity.isFriend && entity.isPellet;
                    break;
                };
            };
            if (isConditionMet) {
                const distance = this.calculateDistance(botX, botY, entity.x, entity.y);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestEntity = entity;
                };
            };
        };
        return {
            distance: closestDistance,
            entity: closestEntity,
        };
    };

    eject() {
        this.send(buffers.eject());
    };

    split() {
        this.send(buffers.split());
    };

    move() {
        const bot = {
            x: 0,
            y: 0,
            size: 0
        };
        for (const id of this.botCellsIDs) {
            const cell = this.viewportEntities[id];
            if (cell) {
                bot.x += cell.x / this.botCellsIDs.length;
                bot.y += cell.y / this.botCellsIDs.length;
                bot.size += cell.size;
            };
        };
        const closestBiggerPlayer = this.getClosestEntity('biggerPlayer', bot.x, bot.y, bot.size);
        const closestSmallerPlayer = this.getClosestEntity('smallerPlayer', bot.x, bot.y, bot.size);
        const closestPellet = this.getClosestEntity('pellet', bot.x, bot.y, bot.size);

        if(botsConfig.followMouse) {
            this.send(buffers.move(botsConfig.mouseX + this.offsetX, botsConfig.mouseY + this.offsetY, this.decryptionKey));
        } else if (closestBiggerPlayer.entity && closestBiggerPlayer.distance < Math.sqrt(closestBiggerPlayer.entity.size * 100 / Math.PI) + 420) {
            const angle = (Math.atan2(closestBiggerPlayer.entity.y - bot.y, closestBiggerPlayer.entity.x - bot.x) + Math.PI) % (2 * Math.PI);
            this.send(buffers.move(14142 * Math.cos(angle), 14142 * Math.sin(angle), this.decryptionKey));
        } else if (closestSmallerPlayer.entity) {
            this.send(buffers.move(closestSmallerPlayer.entity.x, closestSmallerPlayer.entity.y, this.decryptionKey));
        } else if(closestPellet.entity) {
            this.send(buffers.move(closestPellet.entity.x, closestPellet.entity.y, this.decryptionKey));
        } else if (!closestBiggerPlayer.entity && !closestSmallerPlayer.entity && !closestPellet.entity) {
            const random = Math.random();
            const randomX = ~~(1337 * Math.random());
            const randomY = ~~(1337 * Math.random());
            if (random > 0.5) this.send(buffers.move(bot.x + randomX, bot.y - randomY, this.decryptionKey));
            else if (random < 0.5) this.send(buffers.move(bot.x - randomX, bot.y + randomY, this.decryptionKey));
        };

    };

};

const botsServer = new WebSocket.Server({
    port: 6969,
});

botsServer.on('connection', ws => {
    ws.on('message', buffer => {
        const reader = new Reader(buffer.buffer.slice(6), true);
        const packetID = reader.readUint8();
        switch(packetID) {
            case 0: {
                botsConfig.protocol = reader.readUint32();
                botsConfig.client = reader.readUint32();
                const gameIP = reader.readString();
                const name = reader.readString();
                const count = reader.readUint8();
                botsConfig.startBots(gameIP, name, count);
                break;
            };
            case 16: {
                botsConfig.mouseX = reader.readInt32();
                botsConfig.mouseY = reader.readInt32();
                break;
            };
            case 17: {
                for(const i in botsConfig.bots) botsConfig.bots[i].split();
                break;
            };
            case 21: {
                for(const i in botsConfig.bots) botsConfig.bots[i].eject();
                break;
            };
            case 99: {
                botsConfig.followMouse = true;
                break;
            };
            case 100: {
                botsConfig.followMouse = false;
                break;
            };
        };
    });
});