/**
 * Error type for the Shipping Oracle SDK.
 * Mirrors the variant names from sdk/rust/src/error.rs.
 */
/** Structured error thrown by the Shipping Oracle SDK. */
export class OracleSdkError extends Error {
    name = "OracleSdkError";
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        // Restore prototype chain in transpiled environments (e.g. ts-node, Babel).
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
