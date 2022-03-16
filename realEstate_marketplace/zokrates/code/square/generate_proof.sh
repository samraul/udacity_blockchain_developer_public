# compile -i square.code
# zokrates setup

for i in {10..19}
do
    squared=$((i*i))
    folder=./proof_$i
    file_witness=$folder/witness
    file_proof=$folder/proof.json
    mkdir $folder
    ~/zokrates compute-witness -a $i $squared -o $file_witness
    ~/zokrates generate-proof -w $file_witness -j $file_proof

    echo \n== next ==\n
done
