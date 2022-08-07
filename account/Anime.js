import { myAniDB, connect } from '../database.js'
import Genre, { searchGenre } from './Genre.js'

// The following array is arranged in the ascending order of importance:
const _formats = ['SPECIAL', 'MUSIC', 'TV_SHORT', 'ONA', 'OVA', 'MOVIE', 'TV']
export function getFormatValue(formatAsString) {
    return _formats.indexOf(formatAsString)
}
export function getFormatString(formatValue) {
    return _formats[formatValue]
}

const _statuses = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS']
export function getStatusValue(statusAsString) {
    return _statuses.indexOf(statusAsString)
}
export function getStatusString(statusValue) {
    return _statuses[statusValue]
}

const _myStatuses = ['SKIPPED', 'PLANNING', 'PAUSED', 'CURRENT', 'COMPLETED', 'DROPPED']
export function getMyStatusValue(myStatusAsString) {
    return _myStatuses.indexOf(myStatusAsString)
}
export function getMyStatusString(myStatusValue) {
    return _myStatuses[myStatusValue]
}

export default class Anime {
    static fromObject(dbAnimeObject) {
        return new Anime(dbAnimeObject.id, dbAnimeObject.prequelId, dbAnimeObject.name, dbAnimeObject.format, dbAnimeObject.episodes,
            dbAnimeObject.episodeDurationMins, dbAnimeObject.status, dbAnimeObject.startDate, dbAnimeObject.finishDate, 
            dbAnimeObject.animeSeriesId, dbAnimeObject.score, dbAnimeObject.myStatus, dbAnimeObject.episodeProgress, 
            dbAnimeObject.myStartDate, dbAnimeObject.myFinishDate, dbAnimeObject.totalRewatches, dbAnimeObject.notes
        )
    }

    constructor(id, prequelId, name, format, episodes, episodeDurationMins, status, startDate, finishDate,
        animeSeriesId, score, myStatus, episodeProgress, myStartDate, myFinishDate, totalRewatches, notes
    ) {
        this.id = id
        this.prequelId = prequelId
        this.name = name
        
        if(format == -1) format = null
        if(format < 0 || format >= _formats.length)
            throw new Error('Invalid format value: ' + format + ', for anime: ' + id)
        this.format = format

        if(episodes < 0)
            throw new Error('Number of episodes cannot be negative for anime: ' + id)
        this.episodes = episodes

        if(episodeDurationMins < 0)
            throw new Error('Episode duration cannot be negative for anime: ' + id)
        this.episodeDurationMins = episodeDurationMins

        if(status < 0 || status >= _statuses.length)
            throw new Error('Invalid status value: ' + status + ', for anime: ' + id)
        this.status = status

        if(startDate && finishDate && startDate > finishDate)
            throw new Error('Start date cannot be after finish date for anime: ' + id)
        this.startDate = startDate
        this.finishDate = finishDate
        this.animeSeriesId = animeSeriesId

        if(score < 0 || score > 10)
            throw new Error('Score must be between 0-10 for anime: ' + id)
        this.score = score

        if(myStatus < 0 || myStatus >= _myStatuses.length)
            throw new Error('Invalid myStatus value: ' + myStatus + ', for anime: ' + id)
        this.myStatus = myStatus

        if(episodeProgress == null) episodeProgress = 0
        if(episodeProgress < 0 || (episodes && episodeProgress > episodes))
            throw new Error('Episode progress must be between 0 and total episode count for anime: ' + id)
        this.episodeProgress = episodeProgress

        if(myStartDate && myFinishDate && myStartDate > myFinishDate)
            throw new Error('Your start date cannot be after your finish date for anime: ' + id)
        if(myStartDate && myStartDate < startDate)
            throw new Error('Could not have started anime before it had stated airing for anime: ' + id)
        this.myStartDate = myStartDate
        this.myFinishDate = myFinishDate

        if(totalRewatches == null) totalRewatches = 0
        if(totalRewatches < 0) throw new Error('Total rewatches cannot be negative for anime: ' + id)
        this.totalRewatches = totalRewatches
        this.notes = notes
    }

    async genres() {
        return await getAllGenreForAnime(this.id)
    }

    runtimeMins() {
        return this.episodes * this.episodeDurationMins
    }

    watchtimeMins() {
        return this.episodeProgress * this.episodeDurationMins
    }

    async seriesScore() {
        let totalScore = 0, totalCount = 0;
        for(const result of await searchAnimeBySeries(this.id)) {
            const anime = Anime.fromObject(result)
            totalScore += anime.score * anime.episodes * anime.format;
            totalCount += anime.episodes * anime.format;
        }
        return totalScore/totalCount;
    }

    async seriesWatchtimeMins() {
        let runtimeAccumulator = 0
        for(const result of await searchAnimeBySeries(this.id))
            runtimeAccumulator += Anime.fromObject(result).watchtimeMins()
        return runtimeAccumulator
    }

    async seriesRuntimeMins() {
        let runtimeAccumulator = 0
        for(const result of await searchAnimeBySeries(this.id))
            runtimeAccumulator += Anime.fromObject(result).runtimeMins()
        return runtimeAccumulator
    }
}

export async function getNewAnimeSeriesId() {
    try{
        return (await myAniDB.get('SELECT IFNULL(MAX(animeSeriesId), 0) + 1 AS animeSeriesId FROM Anime')).animeSeriesId
    }catch(e) {console.log('Could not get new animeSeriesId.' + e.message)}
}

export async function addAnime(anime, genreIds) {
    if(!myAniDB) await connect()
    const sql = `INSERT INTO Anime VALUES (
        :id, :prequelId, :name, :format, :episodes, :episodeDurationMins, :status, :startDate, :finishDate,
        :animeSeriesId, :score, :myStatus, :episodeProgress, :myStartDate, :myFinishDate, :totalRewatches, :notes
    )`

    const values = {
        ':prequelId': anime.prequelId, ':name': anime.name, ':format': anime.format,
        ':episodes': anime.episodes, ':episodeDurationMins': anime.episodeDurationMins,
        ':status': anime.status, ':startDate': anime.startDate, ':finishDate': anime.finishDate,
        ':animeSeriesId': anime.animeSeriesId, ':score': anime.score, ':myStatus': anime.myStatus,
        ':episodeProgress': anime.episodeProgress, ':myStartDate': anime.myStartDate, ':id': anime.id,
        ':myFinishDate': anime.myFinishDate, ':totalRewatches': anime.totalRewatches,':notes': anime.notes
    }
    try {
        await myAniDB.run(sql, values)
    } catch(e) {
        console.error('Error while adding anime: ' + anime.id + ' to database! ' + e.message)
    }
    if(genreIds) {
        for(const genreId of genreIds) {
            try {
                await myAniDB.run('INSERT INTO AnimeGenre VALUES(:animeId, :genreId)', {
                    ':animeId': anime.id,
                    ':genreId': genreId
                })
            } catch(e) {console.error('Genre missing from the database! ' + e.message)}
        }
    }
}

export async function searchAnime(id) {
    if(!myAniDB) await connect()
    try {
        return await myAniDB.get('SELECT * FROM Anime WHERE id = ?', [id])
    } catch(e) {console.error('Error while searching anime from database! ' + e.message)}
}

export async function getAllGenreForAnime(animeId) {
    if(!myAniDB) await connect()
    try {
        const genreObjIds = await myAniDB.all('SELECT genreId FROM AnimeGenre WHERE animeId = ?', [animeId])
        const allGenre = []
        for(const genreObjId of genreObjIds)
            allGenre.push(Genre.fromObject(await searchGenre(genreObjId.genreId)))
    } catch(e) {console.error('Error while searching all genre from database! ' + e.message)}
    return allGenre
}

export async function searchAnimeBySeries(animeSeriesId) {
    if(!myAniDB) await connect()
    try {
        return await myAniDB.all('SELECT * FROM Anime WHERE animeSeriesId = ?', [animeSeriesId])
    } catch(e) {console.error('Error while searching anime by series from database! ' + e.message)}
}

export async function getAllSuccessors(animeId) {
    if(!myAniDB) await connect()

    try{
        return await myAniDB.all('SELECT * FROM Anime WHERE prequelId = ?', [animeId])
    } catch(e) {console.error('Error while searching successor for anime from database! ' + e.message)}
}

export async function updateAnime(anime) {
    const sql = `UPDATE Anime 
    SET 
        prequelId = :prequelId, name = :name, format = :format, episodes = :episodes,
        episodeDurationMins = :episodeDurationMins, status = :status, startDate = :startDate,
        finishDate = :finishDate, animeSeriesId = :animeSeriesId, score = :score, myStatus = :myStatus,
        episodeProgress = :episodeProgress, myStartDate = :myStartDate, myFinishDate = :myFinishDate,
        totalRewatches = :totalRewatches, notes = :notes 
    WHERE id = :id`

    const values = {
        ':prequelId': anime.prequelId, ':name': anime.name, ':format': anime.format,
        ':episodes': anime.episodes, ':episodeDurationMins': anime.episodeDurationMins,
        ':status': anime.status, ':startDate': anime.startDate, ':finishDate': anime.finishDate,
        ':animeSeriesId': anime.animeSeriesId, ':score': anime.score, ':myStatus': anime.myStatus,
        ':episodeProgress': anime.episodeProgress, ':myStartDate': anime.myStartDate, ':id': anime.id,
        ':myFinishDate': anime.myFinishDate, ':totalRewatches': anime.totalRewatches,':notes': anime.notes
    }

    if(!myAniDB) await connect()

    try {
        return await myAniDB.run(sql, values)
    } catch(e) {console.error('Error while updating anime in database! ' + e.message)}
}

export async function deleteAnime(id) {
    if(!myAniDB) await connect()

    try {
        return await myAniDB.run('DELETE FROM Anime WHERE id = :id', {
            ':id': id
        })
    } catch(e) {console.error('Error while deleting anime from database! ' + e.message)}
}