// Debounce utility
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

let selectedItem = null;
let items = [];
let itemsLoaded = false;

$(document).ready(function () {
    const $input = $("#itemId");
    const $suggestionList = $("#suggestionList");

    // Show loading while fetching data
    $input.attr("placeholder", "Loading items...");

    // Load all items from Firebase ONCE
    db.ref("/").once("value").then(snapshot => {
        if (snapshot.exists()) {
            items = Object.values(snapshot.val());
            itemsLoaded = true;
            console.log("Items loaded:", items.length);
            $input.attr("placeholder", "Search item by ID or name...");
        } else {
            console.warn("No items found in database.");
            $input.attr("placeholder", "No items found in DB");
        }
    }).catch(err => {
        console.error("Error loading items:", err);
        $input.attr("placeholder", "Failed to load items");
    });

    // Autocomplete with debounce
    $input.on("input", debounce(function () {
        const query = $(this).val().toLowerCase();
        $suggestionList.empty();

        if (!itemsLoaded) {
            $suggestionList.hide();
            return;
        }

        if (query.length > 0) {
            const matches = items.filter(item => {
                const idStr = String(item.itemId || "").toLowerCase();
                const nameStr = String(item.item_name || "").toLowerCase();
                return idStr.includes(query) || nameStr.includes(query);
            }).slice(0, 10); // ✅ limit suggestions to top 10

            if (matches.length > 0) {
                matches.forEach(match => {
                    const option = $("<a>")
                        .addClass("dropdown-item")
                        .text(`${match.itemId} - ${match.item_name}`)
                        .on("click", function () {
                            $input.val(match.itemId);
                            $suggestionList.hide();
                            showStockModal(match);
                        });
                    $suggestionList.append(option);
                });
                $suggestionList.show();
            } else {
                $suggestionList.hide();
            }
        } else {
            $suggestionList.hide();
        }
    }, 500));

    // Hide suggestion list if clicked outside
    $(document).on("click", function (e) {
        if (!$(e.target).closest("#itemId, #suggestionList").length) {
            $suggestionList.hide();
        }
    });
});

// Show stock modal
function showStockModal(item) {
    selectedItem = item;
    $("#stockModalLabel").text(`${item.item_name}`);
    $("#stockQty").val("");
    $("#stockModal").modal("show");
}

// Show Bootstrap alert
function showStockAlert(message, type = "success") {
    const $alert = $("#stockAlert");
    $alert
        .removeClass("d-none alert-success alert-danger")
        .addClass(`alert alert-${type}`)
        .text(message)
        .show();

    // ✅ clear input correctly
    $("#itemId").val("");

    // Auto-hide after 2.5 seconds
    setTimeout(() => {
        $alert.fadeOut(500, function () {
            $alert.addClass("d-none").removeClass(`alert alert-${type}`);
        });
    }, 2500);
}

// Handle Save button
$("#saveStockBtn").on("click", function () {
    const qty = parseInt($("#stockQty").val(), 10);

    if (isNaN(qty) || qty < 0) {
        showStockAlert("Please enter a valid quantity", "danger");
        $("#stockQty").val("");
        return;
    }

    if (selectedItem && selectedItem.itemId) {
        db.ref("/" + selectedItem.itemId).update({ qty: qty })
        .then(() => {
            showStockAlert(`Stock updated for ${selectedItem.item_name}`, "success");
            $("#stockQty").val("");

            // ✅ Blur active button before hiding modal (prevents aria-hidden warning)
            document.activeElement.blur();

            // Hide modal slightly later
            setTimeout(() => {
                $("#stockModal").modal("hide");
            }, 300);
        })
        .catch(err => {
            console.error("Error updating stock:", err);
            showStockAlert("Failed to update stock.", "danger");
            $("#stockQty").val("");

            // ✅ Blur active button even on error
            document.activeElement.blur();
        });
    }
});
