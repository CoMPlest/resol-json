/*! resol-vbus | Copyright (c) 2013-2018, Daniel Wippermann | MIT license */
'use strict';



const fs = require('fs');
const os = require('os');


const express = require('express');
const winston = require('winston');


const {
    HeaderSet,
    HeaderSetConsolidator,
    Specification,
    SerialConnection,
    TcpConnection,
} = require('resol-vbus');


const config = require('./config');



const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level: 'info',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
    ],
});


const connectionClassByName = {
    SerialConnection,
    TcpConnection,
};


const spec = Specification.getDefaultSpecification();


const headerSet = new HeaderSet();


const generateJsonData = async function() {
    const packetFields = spec.getPacketFieldsForHeaders(headerSet.getSortedHeaders());

    const data = packetFields.map((pf) => {
        return {
            id: pf.id,
            name: pf.name,
            rawValue: pf.rawValue,
        };
    });

    return JSON.stringify(data, null, 4);
};

const generatePrometheusResponse = async function() {
    const packetFields = spec.getPacketFieldsForHeaders(headerSet.getSortedHeaders());

    const data = packetFields.map((pf) => {
        return {
            id: pf.id,
            name: pf.name,
            rawValue: pf.rawValue,
        };
    });

		var response = "";
		response = response.concat("# HELP resol Values as retreived from Resol Solar", '\n');
		response = response.concat("# TYPE resol gauge", '\n');


    for(var i = 0; i < data.length; i++) {
        var obj = data[i];

				logger.debug(obj.id);
				logger.debug(obj.name);
				logger.debug(obj.rawValue);

				response = response.concat('resol{id="', obj.id, '",name="', obj.name, '"} ', obj.rawValue, '\n')
    }

    return response;
};

let currentData = {}

const writeHeaderSet = async (filename) => {
    logger.debug('HeaderSet complete');

    const data = await generateJsonData();

    currentData = JSON.parse(data)

    await new Promise((resolve, reject) => {
        fs.writeFile(filename, data, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
};


const main = async () => {
    logger.debug('Starting server...');

    const app = express();

    app.get('/api/v1/live-data', (req, res) => {
        generateJsonData().then(data => {
            res.status(200).type('application/json').end(data);
        }).then(null, (err) => {
            logger.error(err);
            res.status(500).type('text/plain').end(err.toString());
        });
    });

    app.get('/api/v1/monitor', (req, res) => {
        generatePrometheusResponse().then(data => {
            res.status(200).type('text/plain').end(data);
        }).then(null, (err) => {
            logger.error(err);
            res.status(500).type('text/plain').end(err.toString());
        });
    });

    await new Promise((resolve, reject) => {
        app.listen(config.httpPort, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });

    logger.debug('Connect to VBus data source...');

    const hsc = new HeaderSetConsolidator({
        interval: config.loggingInterval,
    });

    const ConnectionClass = connectionClassByName [config.connectionClassName];

    const connection = new ConnectionClass(config.connectionOptions);

    connection.on('packet', (packet) => {
        headerSet.addHeader(packet);
        hsc.addHeader(packet);
    });

    hsc.on('headerSet', (headerSet) => {
        if (config.loggingFilename) {
            writeHeaderSet(config.loggingFilename).then(null, err => {
                logger.error(err);
            });
        }
    });

    
    setTimeout(() => {
        if (currentData) {
            logOneMin();
            let oneMinLog = setInterval(logOneMin, 60*1000);
        }
    }, 60000 - new Date().getTime() % 60000);
    //}, 10000);


    function createLogFile(filename) {
        if (!fs.existsSync("./logs/")) fs.mkdirSync("./logs/");

        logger.info(`Created file ${filename}!`);

        let header = "Date\t";
        for(let sensor of currentData) {
            header += sensor.name + "\t";
        }
        header += "\n";

        fs.writeFileSync(filename, header, function (err) {
            if (err) throw err;
            logger.error(`Cannot write to file ${filename}!`);
        })
    }


    async function logOneMin() {
        logger.debug("Writing to log files");
        
        let date = new Date();
        let dateFilename = date.getFullYear().toString() + ("0" + (date.getMonth()+1)).slice(-2) + ("0" + date.getDate()).slice(-2)
        let filename = "./logs/" + "TextData_" + dateFilename + ".log"

        if (!fs.existsSync("./logs")) fs.mkdirSync("./logs");

        if (!fs.existsSync(filename)) createLogFile(filename);

        let logData = date.getFullYear().toString() + "." 
                    + ("0" + (date.getMonth()+1)).slice(-2) + "."
                    + ("0" + date.getDate()).slice(-2) + ". "
                    + ("0" + date.getHours()).slice(-2) + ":"
                    + ("0" + date.getMinutes()).slice(-2) + ":00\t";
        for(let sensor of currentData) {
            logData += sensor.rawValue.toString().replace(".", ",") + "\t";
        }
        logData += "\n";

        await new Promise((resolve, reject) => {
            fs.appendFile(filename, logData, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }    

    await connection.connect();

    logger.info('Ready to serve from the following URLs:');
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const ifaceConfig of iface) {
            if (ifaceConfig.family === 'IPv4') {
                logger.info('    - http://' + ifaceConfig.address + ':' + config.httpPort + '/api/v1/live-data' + (ifaceConfig.internal ? ' (internal)' : ''));
            }
        }
    }

    hsc.startTimer();

    return new Promise((resolve, reject) => {
        // nop, just run forever
    });
};



if (require.main === module) {
    main(process.argv.slice(2)).then(null, err => {
        logger.error(err);
    });
} else {
    module.exports = main;
}
