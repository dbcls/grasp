import pino from "pino";

export default pino({
    prettyPrint: !!process.env.PRETTY_PRINT_LOGS
})