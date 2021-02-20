'use strict';

const DateFormat = require('dateformat');
const Util = require('util');
const Crawler = require('crawler');

const DB = require('../db');
const FundParser = require('../analyzer/fundparser');
const Analyzer = require('../analyzer/fundanalyzer');
const Log = require('../log');
const { subtract } = require('lodash');

// Crawl url
const themeUri = "http://api.fund.eastmoney.com/ztjj/GetZTJJList?callback=jQuery183034382836069271905_1613810977162&tt=0&dt=syl&st=%s&_=%s"
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.1 (KHTML, like Gecko) Chrome/21.0.1180.71 Safari/537.1 LBBROWSER',
    'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; QQDownload 732; .NET4.0C; .NET4.0E)',
    'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.84 Safari/535.11 SE 2.X MetaSr 1.0',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Maxthon/4.4.3.4000 Chrome/30.0.1599.101 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 UBrowser/4.0.3214.0 Safari/537.36'
]

const headers = {
    'Host': 'api.fund.eastmoney.com',
    'Proxy-Connection': 'keep-alive',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate',
    'Referer': 'http://fund.eastmoney.com/',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
}

class Task {

    constructor(type) {
        var timestamp = Date.now();
        this.type = type
        this.uri = Util.format(themeUri, type, timestamp)

        // Init headers
        var userAgent = userAgents[Task.getRandomInt(userAgents.length)];
        headers['User-Agent'] = userAgent;
        this.headers = headers;

        // Init store path
        var now = DateFormat(new Date(), 'yyyy/mm/dd')
        this.storePath = now + '/theme.json'

        this.tryTimes = 0
    }

    static getRandomInt(max) {
        return Math.floor(Math.random() * Math.floor(max));
    }

    static _fixType(type) {
        switch(type) {
            case 'SYL_W': return 'week'
            case 'SYL_M': return 'month'
            case 'SYL_Q': return 'quarter'
            case 'SYL_1N': return 'year'
            default: return type
        }
    }
}

class TaskQueue {
    constructor() {
        this.tasks = []
    }

    static from(fundTypes) {
        var taskQueue = new TaskQueue()
        fundTypes.forEach(fundType => {
            taskQueue.addTask(new Task(fundType))
        })

        return taskQueue
    }

    list() {
        return this.tasks;
    }

    addTask(task) {
        this.tasks.push(task)
    }

    popTask() {
        return this.tasks.pop()
    }

    hasNext() {
        return this.tasks.length > 0
    }
}

class Scheduler {
    constructor() {
        this.tryTimes = 0

        var self = this
        self.taskQueue = TaskQueue.from([
            'SYL_W',   // 一周
            // 'SYL_M',   // 一月
            // 'SYL_Q',   // 一季
            // 'SYL_1N',  // 一年
        ])

        self.crawler = new Crawler({
            rateLimit: 1000, // between two tasks, minimum time gap is 1000 (ms)
            maxConnections: 1,
            method: 'GET',
            jQuery: true,
            callback : function (error, res, done) {
                if (error) {
                    Log.error(error)
                    self.schedule(res.options.task)

                } else {
                    Log.success('Succeed to crawl ' + res.options.uri)

                    const filepath = res.options.task.storePath;
                    const themes = FundParser.parseFundTheme(res.body);
                    DB.write(filepath, themes)
                }

                done()
            }
        })
    }

    start() {
        this.taskQueue.list().forEach(task => {
            this.schedule(task)
        })
    }

    schedule(task) {
        if (!task.success && task.tryTimes < 3) {
            task.tryTimes++
            Log.info('Schedule REQ task ' + task.uri + ', try times = ' + task.tryTimes)
            this.crawler.queue({ uri: task.uri, headers: task.headers, task: task })
        }
    }
}

exports.start = function start() {
    new Scheduler().start()
}



