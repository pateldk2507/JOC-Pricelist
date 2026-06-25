function getData() {
  document.getElementById("error").style.display = "none";
  document.getElementById("card-price").style.display = "none"; 
  document.getElementById("loader").style.display = "block";
  var id = document.getElementById('itemId').value;
  var product = id.toUpperCase();
  console.log(product);

  firebase.database().ref(product).on('value', function(snapshot) {
    if (snapshot.val() != null) {
      document.getElementById("loader").style.display = "none";
      document.getElementById("card-price").style.display = "block";

      var tbody = document.querySelector("#myTable tbody");
      tbody.innerHTML = "";

      var tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${snapshot.val().item_name}</td>
        <td>₹ ${snapshot.val().old_price}</td>
        <td>₹ ${snapshot.val().new_price}</td>
        <td>${snapshot.val().qty}</td>
      `;
      tbody.appendChild(tr);
    } else {
      document.getElementById("loader").style.display = "none";
      document.getElementById("error").style.display = "block";
    }
  });
}