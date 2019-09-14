const express = require('express');
const app = express();
const exphbs = require('express-handlebars');
const async = require('async');
const request = require('request');
const champion = require('./champion.json');
const fs = require('fs');

//Static emblems middleware for locally stored images and css.
app.use(express.static('emblems'));
app.use(express.static('public'));
app.use('/public', express.static('public'));
app.use('/emblems', express.static('emblems'));

//Handlebars middleware.
app.engine('handlebars', exphbs()); //from github doc.
app.set('view engine', 'handlebars');

//Body parser middleware, newest version of Express.
app.use(express.json()); //express.json is middleware, based off of body-parser.
app.use(express.urlencoded({extended : false}));//for url encoded post requests.

var api_key = 'RGAPI-1d1504b9-eaae-46bb-a32e-ea4e45580297';

//Homepage
app.get('/', (req, res) => {
    res.render('index');
})

var data = {};
var data2 = {};
//Searching for a summoner name in NA.
app.post('/search', (req, res) => {

    var sumName = req.body.summonerName;

    var URL = 'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/'+ sumName +'?api_key=' + api_key;

    async.waterfall([
    (callback) => {
            request(URL, (err, response, body) => {
            if (err) {
               console.log(err);
            }
            else {
                var json = JSON.parse(body);
                data.name = json.name;
                data.id = json.id;
                data.accId = json.accountId;
                data.level = json.summonerLevel; 
                callback(null, data);
                
           }
        });
    },
    (data, callback) => {
        var URL2point5 = 'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/' + data.id + '?api_key=' + api_key;
        request(URL2point5, (err, response, body) => {
            if (err) {
                console.log(err);
            }
            else {
                var json = JSON.parse(body);
                const rankedStats = json[2];
                const pngSrc = "/emblems/Emblem_" + rankedStats.tier.toLowerCase() + ".png";
                data.rankedStats = rankedStats;
                data.rankedStats.wr = ((rankedStats.wins/(rankedStats.wins + rankedStats.losses))*100).toFixed(1);
                data.rankedStats.pngSrc = pngSrc;
                if (data.rankedStats.wr < 50) {
                    data.rankedStats.wrHardstuck = true;
                }
                else {
                    data.rankedStats.wrHardstuck = false;
                }
                
                callback(null, data);
            }
        })

    },
    (data, callback) => {
        var URL2 = 'https://na1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-summoner/' + data.id +'?api_key=' + api_key;
        request(URL2, (err, response, body) => {
            if (err) {
                console.log(err);
            }
            else {
                var json = JSON.parse(body);
                var champList = [];
                for (let i = 0 ; i < json.length ; i++) {
                    if (json[i].championLevel >= 5) {
                        var name;
                        for (const singleChamp in champion) {
                            if (champion[singleChamp].key == json[i].championId) {
                                name = champion[singleChamp].id;
                            }
                        }
                        const champ = {
                            champName : name,
                            champIcon : "http://ddragon.leagueoflegends.com/cdn/9.16.1/img/champion/" + name + ".png",
                            champLevel : json[i].championLevel,
                            mastPoint : json[i].championPoints,
                            chestBool : json[i].chestGranted,
                            lastPlayed : new Date(json[i].lastPlayTime).toLocaleDateString()

                        }
                        champList.push(champ);
                    }
                }
                data2.player = data;
                data2.champList = champList;
                callback(null); 
            }
        })
    }
    ], (err) => {
        if (err) {
            console.log(err);
            return;
        }
        console.log(data2);
        res.render('stats', {
            info : data2.player,
            info2 : data2.champList
        })
    });
});

app.post('/search/matchHistPlus', (req, res) => {

    var champ = req.body.matchChamp;
    var whichChampKey;



    for (const singleChamp in champion) {
        if (champion[singleChamp].name == champ) {
            whichChampKey = champion[singleChamp].key;
        }
    }
    async.waterfall([
        (callback) => {
            var URL3 = "https://na1.api.riotgames.com/lol/match/v4/matchlists/by-account/" + data2.player.accId + "?champion=" + whichChampKey + "&queue=420&endIndex=10&beginIndex=0&api_key=" + api_key;
            request(URL3, (err, response, body) => {
            if (err) {
                console.log(err);
            }
            else {
                var json = JSON.parse(body);
                var matches = json.matches;
                var matchId = [];
                if (matches == undefined) {
                    console.log("no matches found");
                }
                else {
                    matches.forEach(match => {
                        matchId.push(match.gameId);
                        return;
                    });
                }
                console.log(matchId);
                callback(null, matchId);
            }
        })
    },
        (matchId, callback) => {
            var playerStats = [];
            var uncompleteURL4 = 'https://na1.api.riotgames.com/lol/match/v4/matches/';
            for (let i = 0 ; i < matchId.length ; i++) {
                var completedURL4 = uncompleteURL4 + matchId[i] + '?api_key=' + api_key;
                request(completedURL4, (err, response, body) => {
                    if (err) {
                        console.log(err);
                    }
                    else {
                        var json = JSON.parse(body);
                        var players = json.participants;
                        var team = json.teams;
                        players.forEach(player => {
                            if (player.championId == whichChampKey) { //could change to for loop, break after if (would need to change player)
                                const playerStat = {
                                    highestRank : player.highestAchievedSeasonTier,
                                    kills : player.stats.kills,
                                    assists : player.stats.assists,
                                    deaths : player.stats.deaths,
                                    killingSpreeMax : player.stats.largestKillingSpree,
                                    longestTimeSpentLiving : (player.stats.longestTimeSpentLiving/60).toFixed(1),
                                    totalDamage : player.stats.totalDamageDealtToChampions,
                                    visionScore : player.stats.visionScore,
                                    minionScore : player.stats.totalMinionsKilled,
                                }
                                var playerTeamId = player.teamId;
                                team.forEach(team => {
                                    if (playerTeamId == team.teamId ) {
                                        const teamStat = {
                                            winBool : team.win == "Win",
                                            firstBloodBool : team.firstBlood,
                                            firstTowerBool : team.firstTower,
                                            firstDragBool : team.firstDragon,
                                            towerKillsInt : team.towerKills,
                                            inhibKillsInt : team.inhibitorKills,
                                            baronKillsInt : team.baronKills,
                                            dragonKillsInt : team.dragonKills,
                                            riftHeraldBool: team.riftHeraldKills == 1
                                        }
                                        playerStat.teamObj = teamStat;
                                    }
                                })
                                playerStats.push(playerStat);
                            }
                        })
                        if (playerStats.length == 10) { //async, by the time render happens, all data will be collected. just 2 games show up in console.
                            data2.playerStats = playerStats;
                            callback(null);
                        }
                    }
                })
                //this part happens before req because async.
            }
        }
    ], (err, result) => {
        if (err) {
            console.log(err);
            return;
        }

        res.render('stats', {
            info : data2.player,
            info2 : data2.champList,
            info3 : data2.playerStats,
            icon : "http://ddragon.leagueoflegends.com/cdn/9.16.1/img/champion/" + champ + ".png",
            matchData : true
        });
        
    });
});







//Clash functionality.
app.post('/search/matchClash', (req, res) => {

    var URL5 = "https://na1.api.riotgames.com/lol/match/v4/matchlists/by-account/" + data2.player.accId + "?queue=700&api_key=" + api_key;
    request(URL5, (err, response, body) => {
        if (err) {
            console.log(err);
        }
        else {
            var json = JSON.parse(body);
            var matches = body.matches;
            for (let i = 0 ; i < matches.length ; i++) {
            }
        }
    })
})




const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
    console.log("Server started on port " + PORT);
});

