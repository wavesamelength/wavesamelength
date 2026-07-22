// ======================================
// MAPTAP LEAGUE APPLICATION LOGIC
// ======================================


import { db } from "./firebase.js";


import {

    collection,
    doc,
    setDoc,
    getDocs,
    getDoc,
    onSnapshot,
    query,
    orderBy

}

from

"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";





// ======================================
// SETTINGS
// ======================================


const POINTS = [
    9,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    1
];



let players = [];





// ======================================
// LOAD PLAYERS
// ======================================


async function loadPlayers(){


    const snapshot = await getDocs(
        collection(
            db,
            "players"
        )
    );


    players = [];


    snapshot.forEach((doc)=>{

        players.push(
            doc.id
        );

    });



    createResultInputs();


}





// ======================================
// CREATE DAILY INPUTS
// ======================================


function createResultInputs(){


    const container =
        document.getElementById(
            "result-entry"
        );


    container.innerHTML = "";



    for(
        let i = 0;
        i < POINTS.length;
        i++
    ){


        const row =
        document.createElement(
            "div"
        );


        row.className =
            "result-row";



        row.innerHTML = `


        <label>
            ${i+1}️⃣
        </label>


        <select class="player-select">


            <option value="">
                Choose player
            </option>


            ${
                players.map(player=>`

                    <option value="${player}">
                        ${player}
                    </option>

                `).join("")
            }


        </select>


        `;



        container.appendChild(row);


    }



}





// ======================================
// SAVE DAILY RESULTS
// ======================================


document
.getElementById(
    "save-results"
)
.addEventListener(
"click",

async ()=>{


    const selections =
        [
            ...document.querySelectorAll(
                ".player-select"
            )
        ]
        .map(
            select=>select.value
        );




    if(
        selections.includes("")
    ){

        alert(
            "Please choose every position"
        );

        return;

    }




    const duplicates =
        new Set(
            selections
        ).size
        !==
        selections.length;



    if(duplicates){


        alert(
            "A player cannot appear twice"
        );


        return;

    }





    const today =
        new Date()
        .toISOString()
        .split("T")[0];




    await setDoc(

        doc(
            db,
            "results",
            today
        ),

        {


            date:
                today,


            placements:
                selections,


            week:
                getWeekNumber(
                    new Date()
                )


        }

    );



    alert(
        "Results saved!"
    );


});








// ======================================
// LIVE LEADERBOARD
// ======================================


function listenForResults(){


onSnapshot(

    collection(
        db,
        "results"
    ),


    snapshot=>{


        calculateLeaderboard(
            snapshot.docs
        );


    }


);


}








async function calculateLeaderboard(results){


    let scores = {};



    players.forEach(player=>{

        scores[player]=0;

    });





    results.forEach(result=>{


        const data =
            result.data();



        data.placements
        .forEach(
            (player,index)=>{


                scores[player]
                +=
                POINTS[index];


            }
        );



    });





    const sorted =

        Object.entries(scores)

        .sort(
            (a,b)=>
            b[1]-a[1]
        );



    renderLeaderboard(
        sorted
    );



    checkWinner(
        sorted
    );

}





// ======================================
// DISPLAY LEADERBOARD
// ======================================


function renderLeaderboard(data){


const table =
document.getElementById(
    "leaderboard"
);



table.innerHTML="";



data.forEach(
(player,index)=>{


const row =
document.createElement(
"tr"
);



row.innerHTML=`

<td>
${index+1}
</td>


<td>
${player[0]}
</td>


<td>
${player[1]}
</td>

`;



table.appendChild(row);


});


}









// ======================================
// WEEKLY WINNER
// ======================================


function checkWinner(sorted){


const today =
new Date()
.getDay();



//
// Tuesday = 2
//

if(
today !== 2
)
return;



const winner =
sorted[0];



const card =
document.getElementById(
"winner-card"
);



card.classList.remove(
"hidden"
);



document
.getElementById(
"winner-name"
)
.innerText =
winner[0];



document
.getElementById(
"winner-score"
)
.innerText =
`${winner[1]} points`;



}









// ======================================
// WEEK NUMBER
// ======================================


function getWeekNumber(date){


const start =
new Date(
date.getFullYear(),
0,
1
);


const diff =
date -
start;



return Math.ceil(
(
(
diff /
86400000
)
+
start.getDay()
+
1
)
/
7
);


}








// ======================================
// START APP
// ======================================


loadPlayers();

listenForResults();
