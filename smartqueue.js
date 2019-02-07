// DO NOT INSTRUMENT

debug=true;
print= console.log;

//probablilty 99% (two-sides)
student_t_table = {
    10:3.169,
    15:2.947,
    20:2.845,
    30:2.750,
    50:2.678,
    100:2.626,
    1000:2.576
}
function SmartQueue(option) {
  this.capacity = option.windowSize || 20;
  this.ratio = option.varBar || 0.03;
  this.maxTime = option.maxTime;
  this.maxRuns = option.maxRuns;
  this.groupMinTime = option.groupMinTime || 200;
  this.totalExecutionTime = 0;
  this.totalRuns = 0;
  this.step = option.initStep || 1;
  this.tDistri = student_t_table[this.capacity];
  if(!this.tDistri) {
    if(this.capacity > 50) {
      this.tDistri = student_t_table[50];
    } else if(this.capacity > 30) {
      this.tDistri = student_t_table[30];
    } else if(this.capacity > 20) {
      this.tDistri = student_t_table[20];
    }else {
      this.tDistri = student_t_table[10];
    }
  }
  if(debug) {
    print("[smartq] creating smart-queue "+this.capacity+" "+this.ratio+" "+this.step+" "+this.tDistri);
  }
  this.add = _add;
  this.check = _check;
  this.updateStep = _updateStep;
  this.getAvg = _getAvg;
  this.data={num:0, sum:0, sumS:0, q:[]};
  this.warmupPhase = true;
  this.tail = undefined;
}


function _getAvg(){
  // stopped before warmup finishes
  if(this.data.q.length == 0) {
    if(debug) {
      print("[smartq] stop before warmup finishes "+this.totalExecutionTime +" ms / "+this.totalRuns +" runs");
    }
    return this.totalExecutionTime / this.totalRuns * 1000;
  }
  var gc = this.data.q.reduce(function(a, b) {
    return Math.max(a, b);
  });
  //return 1000.0 * (this.data.sum - gc) / (this.data.num - 1) / this.step;
  return 1000 * this.data.sum / this.data.num /this.step;
}

function _updateStep(newStep){
  if(this.step != newStep) {
    if(debug)
      print("[smartq] updating steps "+this.step+"=>"+newStep);
    this.step = newStep
    this.data = {num:0, sum:0, sumS:0, q:[]};
  }
}

function _add(elapse){
  this.totalExecutionTime+=elapse;
  this.totalRuns+=this.step;
  if(debug)
    print("[smartq] adding "+elapse+" step: "+this.step + " samples "+this.data.q);
  if(elapse < 1000){
    this.updateStep(this.step*2);
    return;
  }
  var tmp = elapse;
  if(!this.tail) {
    this.tail = tmp;
    return false;
  }
  if(this.warmupPhase) {
    var tailIncrease = tmp > this.tail;
    if(tailIncrease){
      if(debug) {
        print("[smartq] start to collect data");
      }
      this.warmupPhase = false;
    }
  }
  this.tail = tmp;
  if(this.warmupPhase)
    return false;
  this.data.q.push(tmp);
  this.data.sum+=tmp;
  this.data.sumS += tmp*tmp;
  this.data.num++;
  if(this.data.num > this.capacity){
    this.data.num--;
    var head = this.data.q.shift();
    this.data.sum -= head;
    this.data.sumS -= head * head;
  }
  if(debug)
    print("[smartq] average of recent "+(this.data.num * this.step)+" runs (step "+this.step+"): "+this.getAvg()/1000 + " ms");
}

function _check(){
  if(this.maxRuns && this.totalRuns >= this.maxRuns) {
      return true;
  }else if(this.maxTime && this.totalExecutionTime >= this.maxTime) {
      return true;
  }else if(this.data.num == this.capacity){
    /**
     * the variance for the whole set, not used
     */
    var variance = Math.sqrt(this.data.sumS/(this.data.num-1) - (this.data.sum/this.data.num)*(this.data.sum/(this.data.num-1)));
    var delta1 = this.tDistri * variance / Math.sqrt(this.data.num) / (this.data.sum / this.data.num); //student-t n = 20

    /** the variance excluding the slowest run, caused probably by e.g., gc*/
    var gc = this.data.q.reduce(function(a, b) {
      return Math.max(a, b);
    });
    var variance_gc = Math.sqrt((this.data.sumS-gc*gc)/(this.data.num-2) - ((this.data.sum-gc)/(this.data.num-1))*((this.data.sum-gc)/(this.data.num-2)));
    var delta2 = this.tDistri * variance_gc / Math.sqrt(this.data.num-1) / ((this.data.sum - gc) / (this.data.num - 1)); //student-t n = 19
    if(delta2 < this.ratio) {
      //if(debug)
      print("[smartq] STEADY average time: " + (this.getAvg() / 1000) +" ms, variance: ± " + (delta2*100) + "% totalExecutionTime: "+this.totalExecutionTime+" totalRuns: "+this.totalRuns); //+ ", without gc "+delta2);
      return true;
    }else {
      if(debug)
        print("[smartq] not steady "+delta2 + " > "+this.ratio);
    }
  }
  return false;
}

module.exports=SmartQueue;
