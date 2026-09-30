fetch("/documentos")

.then(res=>res.json())

.then(data=>{


let tabla=

document.getElementById("lista");



data.documentos.forEach(doc=>{


tabla.innerHTML +=

`

<tr>

<td>
${doc.name}
</td>


<td>

<a href="${doc.webViewLink}" target="_blank">

Ver

</a>

</td>


</tr>

`;



});


});