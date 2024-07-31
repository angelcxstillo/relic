let players: PlayerSet, names: string[];

class Player {
    name: string;
    /**
     * Augmented classes.
     * Automatic constructors.
     * @param {string} name Also easy documented parameters.
    */
    constructor(name: string) {
        this.name = name;
    }

    toString() {
        let _vals = ["name"].map((function (this: Player, _val: string) {
            let _cont: any = this[_val as keyof Player];
            return _val + "=" + (typeof _cont === "string" && ('"'+ _cont.replace('"', '\"') +'"') || _cont);
        }).bind(this));

        return `Player(${_vals.join(", ")})`;
    }

    highscore: number = 0;
    activity: number[] = [];

    /**
     * Set highscore if points are higher
     * @param {number} points
    */
    score(points: number) {
        if (points > this.highscore) {
            this.highscore = points;
        }

        this.activity.push(points);
        return console.log(`${this.name} scored +${points}!`);
    }
}


// --------

names = ["Lucian", "Sarah", "Perry"];

players = Object.fromEntries((function () {
    let playerName: string, _results: any[] = [];

    for (playerName of names) {
        _results.push([playerName, new Player(playerName)]);
    }
    
    return _results;
}).call(this));

type PlayerSet = { [key: string]: Player };