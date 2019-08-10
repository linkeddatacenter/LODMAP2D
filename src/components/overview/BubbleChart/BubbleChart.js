import * as d3 from 'd3';

function updateTotals(node, partitions_table, total, ns) {
    //update overview total
    let overviewPartition=partitions_table.find(p=>{
        return p.id=="overview"
    });
    if (total = "total" || total == undefined) {
        overviewPartition.total+=node.amount;
    }
    if ((total = "filtered" || total == undefined) && node.active) {
        overviewPartition.total_filtered+=node.amount;
    }   
    Object.keys(node.partitions).forEach((partition_id) => {
        let target_partition = partitions_table.find((partition) => {
            return partition_id == partition.id;
        });
        let target_subset = target_partition.subsets.find((subset) => {
            return subset.id == node.partitions[partition_id];
        });
        //groupFunction define the way to calculate totals
        switch (target_partition.groupFunction) {
            //total = (sum of nodes.ammount - sum of nodes.referenceAmount)/ sum of nodes.referenceAmount
            case ns.bgo("trend_average").value:
                if (target_subset.totalSupport == undefined) {
                    target_subset.totalSupport = {
                        amount: 0,
                        amountFiltered: 0,
                        referenceAmount: 0,
                        referenceAmountFiltered: 0
                    };
                }
                if (total = "total" || total == undefined) {
                    target_subset.totalSupport.amount += node.amount;
                    target_subset.totalSupport.referenceAmount += node.referenceAmount;
                    target_subset.total = (target_subset.totalSupport.amount - target_subset.totalSupport.referenceAmount) / target_subset.totalSupport.referenceAmount;
                }
                if ((total = "filtered" || total == undefined) && node.active) {
                    target_subset.totalSupport.amountFiltered += node.amount;
                    target_subset.totalSupport.referenceAmountFiltered += node.referenceAmount;
                    target_subset.total_filtered = (target_subset.totalSupport.amountFiltered - target_subset.totalSupport.referenceAmountFiltered) / target_subset.totalSupport.referenceAmountFiltered;
                }
                break;
            //total = sum of node.account (absolute o natural)
            case ns.bgo("amounts_sum").value:
                if (total = "total" || total == undefined)
                    target_subset.total += target_partition.sortCriteria == ns.bgo("abs_sort") ? Math.abs(node.amount) : node.amount;
                if ((total = "filtered" || total == undefined) && node.active)
                    target_subset.total_filtered += target_partition.sortCriteria == ns.bgo("abs_sort") ? Math.abs(node.amount) : node.amount;
                break;
            //total = number of nodes in the subset
            case ns.bgo("accounts_count").value:
                if (total = "total" || total == undefined)
                    target_subset.total += 1;
                if ((total = "filtered" || total == undefined) && node.active)
                    target_subset.total_filtered += 1;
                break;
        }

    });
}
//reset filtered totals
function resetTotal(partitions_table) {
    partitions_table.forEach((partition) => {
        if (partition.id != "overview") {
            partition.subsets.forEach((subset) => {
                subset.total_filtered = 0;
                if (subset.totalSupport != undefined)
                    subset.totalSupport = null;
            })
        }else{
            partition.total_filtered=0;
        }
        
    });

}
//called only the first time
function createNodes(store, ns, width, height, searchText, partitions_table) {
    let nodes = [];
    store.each(null, ns.rdf('type'), ns.bgo('Account')).forEach(account => {
        let newNode;
        let id = store.anyValue(account, ns.bgo('accountId'));

        let title = store.anyValue(account, ns.bgo('title'));
        title = title ? title : "";

        let description = store.anyValue(account, ns.bgo('description'));
        description = description ? description : "";

        let amount = store.anyValue(account, ns.bgo('amount'));
        amount = amount ? parseFloat(amount) : 0;

        let refAmount = store.anyValue(account, ns.bgo('referenceAmount'));
        refAmount = refAmount ? parseFloat(refAmount) : 0;

        let rate = (amount - refAmount) / refAmount;
        rate = isFinite(rate) ? rate : NaN;

        let bg = store.anyValue(account, ns.bgo('background'));
        let partitions = {};
        let subSetUris = store.each(undefined, ns.bgo("hasAccount"), account);
        subSetUris.forEach(subSetUri => {
            let partition = store.any(undefined, ns.bgo("hasAccountSubSet"), subSetUri);
            let partitionId = store.anyValue(partition, ns.bgo("partitionId"))
            partitions[partitionId] = subSetUri.value;
        });
        newNode = {
            id,
            title,
            description,
            amount,
            referenceAmount: refAmount,
            rate,
            bg,
            partitions,
            x: Math.random() * width,
            y: Math.random() * height,
        };
        newNode["active"] = match(newNode, searchText);
        updateTotals(newNode, partitions_table, null, ns);
        nodes.push(newNode);
    })
    nodes.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    return nodes;
}

// if account contains text return true, false otherwise
function match(account, text) {
    return account.title.includes(text) || account.description.includes(text);
}

function getCenters(gridBlocks) {
    const centers = [];
    gridBlocks.forEach(block => {
        const x = block.offsetLeft + block.offsetWidth / 2;
        const y = block.offsetTop + block.offsetHeight / 2;
        centers.push({ x, y });
    });
    return centers;
}

export default class BubbleChart {

    constructor(el, bgolib, partitions, width, height) {
        this.el = el;
        this.height = height;
        this.width = width;
        this.store = bgolib.bgoStore;
        this.ns = bgolib.ns;
        this.partitions = partitions
        this.velocityDecay = 0.2;
        this.forceStrength = 0.03;
        this.simulation;
        this.nodes = [];
        this.totalDefaultArea = 0;
    }
    //called only the first time
    render(searchText) {
        this.nodes = createNodes(this.store, this.ns, this.width, this.height, searchText, this.partitions);
        // console.table(this.nodes)
        const overview = this.store.any(null, this.ns.rdf('type'), this.ns.bgo('Overview'));
        const colorScheme = this.store.any(overview, this.ns.bgo('hasTrendColorScheme'));
        const noTrendColor = this.store.anyValue(colorScheme, this.ns.bgo('noTrendColor'));
        const maxTrendColor = this.store.anyValue(colorScheme, this.ns.bgo('maxTrendColor'));
        const minTrendColor = this.store.anyValue(colorScheme, this.ns.bgo('minTrendColor'));



        const colorScale = (val) => {
            let fill = d3.scaleLinear()
                .domain([-1, 0, 1])
                .range([minTrendColor, '#fefefe', maxTrendColor])
                .clamp(true);

            if (isFinite(val)) {
                return fill(val);
            }
            return noTrendColor;
        }

        // Calc total default area
        // for (const n of this.nodes) {
        //     this.totalDefaultArea += 3.14 * (radiusScale(n.amount) ** 2);
        // }
        // const maxRadius = (this.width > this.height) ? this.height : this.width;
        // const maxArea = (3.14 * (((maxRadius / 2) - (maxRadius / 10)) ** 2));
        // // Radius multiplier
        // const radiusChangeRate = maxArea / this.totalDefaultArea;



        let bubbles = d3.select("svg#vis")
            .selectAll("circle")
            .data(this.nodes)
            .enter()
            .append("circle")
            .classed("bubble", true)
            .classed("disabled", d => { return !d.active })
            .attr("r", 0)
            .attr("fill", function (d) {
                return colorScale(d.rate);
            })
            .attr("fill", function (d) {
                return colorScale(d.rate);
            })
            .attr("stroke", function (d) {
                return d3.rgb(colorScale(d.rate)).darker();
            })
            .on("mouseover", function () {
                this.style["stroke-width"] = 4;
            })
            .on("mouseout", function () {
                this.style["stroke-width"] = 1;
            });

        // native tooltip
        bubbles.append('title').text(function (d) {
            return `${d.title}\n${d.rate * 100}%`;
        })


        const ticked = () => {
            bubbles
                .attr("cx", function (d) {
                    return d.x;
                })
                .attr("cy", function (d) {
                    return d.y;
                });
        }

        this.simulation = d3
            .forceSimulation()
            .velocityDecay(this.velocityDecay)
            .nodes(this.nodes)
            .on("tick", ticked)
            .stop()

        // this.updateSimulation();
        // groupBubble(this);

    }

    // Update bubbles radius and update the simulation obj with the new charge force according to the new radius
    updateSimulation(radiusUpdate = true) {
        const maxAmount = this.nodes[0].amount;
        const radiusScale = d3.scalePow().exponent(0.5)
            .domain([0, maxAmount]).range([2, 100]);

        if (this.totalDefaultArea == 0) {
            for (const n of this.nodes) {
                this.totalDefaultArea += 3.14 * (radiusScale(n.amount) ** 2);
            }
        }

        const maxRadius = (this.width > this.height) ? this.height : this.width;
        const maxArea = (3.14 * (((maxRadius / 2) - (maxRadius / 10)) ** 2));
        // Radius multiplier
        const radiusChangeRate = radiusUpdate ? maxArea / this.totalDefaultArea : 1;

        let bubbles = d3.select("svg#vis")
            .selectAll("circle");

        bubbles
            .transition()
            .duration(2000)
            .attr("r", function (d) {
                return radiusScale(d.amount) * Math.sqrt(radiusChangeRate);
            });

        const charge = (d) => {
            return -Math.pow(radiusScale(d.amount) * Math.sqrt(radiusChangeRate), 2.0) * this.forceStrength;
        }

        this.simulation.force("charge", d3.forceManyBody().strength(charge)).stop()
    }

    // called when partition change, group or split bubbles
    update(width, height, gridBlocks, activePartitionId) {

        // update with new boundaries
        this.height = height;
        this.width = width;

        if (activePartitionId == 'overview') {
            this.updateSimulation()
            this.groupBubble();
        } else {

            const centers = getCenters(gridBlocks);
            let subsetToCenterMap = {};

            let activeSubsets = this.partitions.find(partition => {
                return partition.id == activePartitionId;
            }).subsets;

            activeSubsets.forEach((subset, i) => {
                subsetToCenterMap[subset.id] = centers[i];
            })


            // TODO aggiungere ai gridblock un blocco per i default, i nodi senza partizioni sono a posto
            this.simulation.force(
                "x",
                d3
                    .forceX()
                    .strength(this.forceStrength)
                    .x(function (d) {
                        let nodePartition = d.partitions[activePartitionId];
                        if (nodePartition) {
                            return subsetToCenterMap[nodePartition].x;
                        } else {
                            return centers[centers.length - 1].x;
                        }
                    })
            );
            this.simulation.force(
                "y",
                d3
                    .forceY()
                    .strength(this.forceStrength)
                    .y(function (d) {
                        let nodePartition = d.partitions[activePartitionId];
                        if (nodePartition) {
                            return subsetToCenterMap[nodePartition].y;
                        } else {
                            return centers[centers.length - 1].y;
                        }
                    })
            );
            this.updateSimulation(false)
            this.simulation.alpha(1).restart();

        }

    }

    groupBubble() {
        this.simulation.force("x", d3.forceX().strength(this.forceStrength).x(this.width / 2));
        this.simulation.force("y", d3.forceY().strength(this.forceStrength).y(this.height / 2));
        this.simulation.alpha(1).restart();
    }

    //called when filter changhe filter bubble and compute new filtered totals
    filterBubbles(searchText) {
        resetTotal(this.partitions);
        d3.select("svg#vis")
            .selectAll("circle")
            .classed("disabled", d => {
                d.active = match(d, searchText);
                updateTotals(d, this.partitions, "filtered", this.ns);
                return !d.active // if is active disabled must be false
            });

    }



}