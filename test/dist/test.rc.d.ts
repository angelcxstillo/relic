declare let players: PlayerSet, MyTypes: any, names: string[], index: any, value: any, _type: any, _j: any;
declare class Player {
    name: string;
    /**
     * Augmented classes.
     * Automatic constructors.
     * @param {string} name Also easy documented parameters.
    */
    constructor(name: string);
    toString(): string;
    highscore: number;
    activity: number[];
    /**
     * Set highscore if points are higher
     * @param {number} points
    */
    score(points: number): void;
}
type PlayerSet = {
    [key: string]: Player;
};
