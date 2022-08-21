import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import fs from 'fs'

if (!fs.existsSync("./db")) {
    fs.mkdirSync("./db")
}

export let myAniDB = null
export let globalAniDB = null

export async function connectToGlobalDB() {
    globalAniDB = await open({
        filename: './db/globalAniDB.db',
        driver: sqlite3.Database
    })

    await globalAniDB.run(`
        CREATE TABLE IF NOT EXISTS GlobalAnimeRatings (
            userId INTEGER NOT NULL,
            animeId INTEGER NOT NULL,
            score FLOAT NOT NULL,
            PRIMARY KEY(userId, animeId)
        )
    `)
}

export async function connectToMyDB() {
    myAniDB = await open({
        filename: './db/myAniDB.db',
        driver: sqlite3.Database
    })

    await myAniDB.exec('PRAGMA foreign_keys = ON')

    await myAniDB.exec(`
        CREATE TABLE IF NOT EXISTS Anime (
            id INTEGER PRIMARY KEY,
            prequelId INTEGER,
            name VARCHAR(63) NOT NULL,
            format INTEGER NOT NULL,
            episodes INTEGER,
            episodeDurationMins INTEGER,
            status INTEGER NOT NULL,
            startDate INTEGER,
            finishDate INTEGER,
            animeSeriesId INTEGER NOT NULL,
            score FLOAT,
            myStatus INTEGER NOT NULL,
            episodeProgress INTEGER NOT NULL,
            myStartDate INTEGER,
            myFinishDate INTEGER,
            totalRewatches INTEGER NOT NULL,
            notes VARCHAR(255)
        )
    `)

    await myAniDB.run(`
        CREATE TABLE IF NOT EXISTS Genre (
            id INTEGER PRIMARY KEY,
            name VARCHAR(63) NOT NULL
        )
    `)

    await myAniDB.run(`
        CREATE TABLE IF NOT EXISTS AnimeGenre (
            animeId INTEGER NOT NULL REFERENCES Anime(id),
            genreId INTEGER NOT NULL REFERENCES Genre(id),
            PRIMARY KEY(animeId, genreId)
        )
    `)

    await myAniDB.run(`
        CREATE TABLE IF NOT EXISTS UserSimilarityMinHeap (
            idx INTEGER PRIMARY KEY,
            userId INTEGER NOT NULL,
            similarityScore FLOAT NOT NULL
        )
    `)
    await myAniDB.run(`INSERT INTO UserSimilarityMinHeap VALUES(0, 0, -1) ON CONFLICT DO NOTHING`)
}

export async function closeAllDBConnections() {
    await myAniDB.close((err) => {
        if(err) console.error(err.message)
    })

    await globalAniDB.close((err) => {
        if(err) console.error(err.message)
    })

    myAniDB = null
    globalAniDB = null
}