import pino from "pino";

export default pino({
    level: process.env.LOG_LEVEL || 'info'
},
// logs to stdout with no args
pino.destination({ sync: false }))