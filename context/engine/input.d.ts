export declare function updateInputFrame(): void;
export declare function isKeyDown(key: string): boolean;
export declare function isKeyPressed(key: string): boolean;
export declare function isKeyReleased(key: string): boolean;
export declare function getPointerPos(): {
    x: number;
    y: number;
};
export declare function isPointerDown(): boolean;
export declare function isPointerPressed(): boolean;
export declare function isPointerReleased(): boolean;
export declare function bindKey(action: string, keys: string | string[]): void;
export declare function setVirtualKeyState(code: string, down: boolean): void;
export declare function unbindKey(action: string): void;
export declare function isActionDown(action: string): boolean;
export declare function isActionPressed(action: string): boolean;
export declare function isActionReleased(action: string): boolean;
//# sourceMappingURL=input.d.ts.map