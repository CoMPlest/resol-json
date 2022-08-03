/*! resol-vbus | Copyright (c) 2013-2018, Daniel Wippermann | MIT license */
'use strict';



const path = require('path');



const config = {
    httpPort: 3333,
    loggingInterval: 10000,
    loggingFilename: path.resolve(__dirname, 'live-data.json'),
    connectionClassName: 'TcpConnection',
    connectionOptions: {
        host: '<YOUR_VBUS_IP>',
        password: 'vbus',
    },

};



module.exports = config;
