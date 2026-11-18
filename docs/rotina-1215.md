# Rotina 1215 — Importação de Dados (Interface)

**Canônico no Turnocheck:** este arquivo. Fonte original: `docs/Rotina_1215.docx` (Ajuda Apdata).

## Uso no Turnocheck (carga de horários)

Gerar **arquivo-texto** no formato da rotina — **não** inventar `INSERT` SQL e **não** gravar no ERP.

Formato (uma linha por registro; sem espaços entre tokens; datas `AAAAMMDD`):

- **Inclusão:** `IdTransacao;IdCampo;(conteudo)IdCampo;(conteudo)…`
- **Alteração:** `IdTransacao;[IdChave;(valor)]IdCampo;(conteudo)…`
- **Exclusão:** `IdTransacao;[IdChave;(valor)]`

Transações de inclusão usadas na carga de horários (ids via botão `?` no objeto; campos via F1 / `interface-consultar`):

| IdTransacao | Papel | Objeto |
|-------------|-------|--------|
| **15932** | Horarios | 2170 |
| **19762** | HorariosJornadas (não filha por chave) | 2170 |
| **29752** | Jornadas | 3061 |
| **29762** | JornadasItens (não filha por chave) | 3061 |

Prioridade de afinamento: `29752` → `29762` → `15932`/`19762`.

**Modelo Jornada + Steps (Turnocheck):** uma jornada (29752) com descrição composta (`09:00–13:00 / 14:00–18:00`); steps (29762) = 1 período contínuo ou 2 períodos de trabalho (almoço = gap, não jornada top-level). Dedup global por `JOR-{HHMM}-{HHMM}`. Horários (15932/19762) depois.

Geradores de referência no Gestão: `interface-objeto` / `interface-consultar` / `interface-gerar` (`fabianorios/gestaoconsultoria-core`).

---

Rotina 1215
Importação de Dados (Interface)

Essa rotina possibilita a interface de outros sistemas com o Antares 3i. Através dela você pode inserir registros, alterar dados ou excluir registros de qualquer tabela do sistema.

A interface é apenas de entrada, pois para a saída pode ser utilizado o gerador de relatórios, textos e gráficos.

Os dados são submetidos às mesmas consistências a que seriam se fossem digitados diretamente nas telas da ApTools ou do Antares ou de qualquer outro Client, pois quem as executa é o Servidor.

Para obter o id da Transação, faça assim: Entre no próprio Objeto onde você digitaria os dados e clique no botão ?, que fica no canto superior direito da tela. O botão ficará pressionado. Arraste o mouse e solte-o sobre o ícone da transação desejada (Inclusão, Alteração, Exclusão ou Transação Especial, se houver). Será apresentada a tela de Ajuda da Transação. Em seu rodapé você verá o Id da Transação.

Para obter o id do Campo, faça assim: Entre no próprio Objeto onde você digitaria os dados, posicione-se no campo desejado e digite a tecla F1. Será apresentada a tela de Ajuda do Campo. No canto inferior esquerdo dessa tela há o ícone Dados técnicos do campo. Clique nele e será apresentada uma tela com diversas informações sobre o campo, sendo o primeiro deles o seu Id.

O processo é executado em 2 fases, que estão detalhadas abaixo:

1ª Fase

Nessa fase é efetuada a Importação dos dados para o repositório.

Quando você aciona o Objeto 2848, os dados são lidos do arquivo texto que você informa no momento da execução do Objeto e gravados nas 4 tabelas temporárias abaixo:
InterfacesTransacoes
InterfacesTransacoesKeys
InterfacesTransacoesCampos
InterfacesTransacoesCpsR

Essas tabelas ficam disponíveis para consulta no Objeto 3872, onde há 4 abas:
Transação
Chaves
Campos
Campos relacionados

Se quiser, você poderá utilizar este Objeto para confirmar se os dados estão consistentes com o que você informou no arquivo texto.

Nota: O arquivo texto será procurado pelo sistema na pasta do Usuário, sob a pasta Workin.

Informações técnicas sobre o arquivo texto

Para facilitar a compreensão, damos abaixo algumas informações úteis sobre o arquivo texto da interface, cujos exemplos você verá ao longo dessa Ajuda:

Deverá ser utilizada apenas uma linha para cada transação;

Não poderá ser utilizado nenhum espaço em branco entre os dados, a não ser dentro de literais (strings). Exemplos: (José da Silva) é válido.  ( José da Silva ) não é válido);

O primeiro campo a ser informado é o Id da Transação (colunas 1 a 5); Depois tem que vir um ponto-e-vírgula (coluna 6);

Se a transação for de alteração ou de exclusão, a chave tem que ser informada entre colchetes ( [ ] ), sendo que o colchete de abertura tem que estar obrigatoriamente na coluna 7;

Após a informação da chave, quando houver, começa a lista de campos, que é separada do conteúdo por ponto-e-vírgula. O conteúdo deverá ser obrigatoriamente colocado entre parênteses.

As chaves, que estão entre colchetes, seguem a mesmas regras dos campos, que são uma lista de campos separados dos conteúdos por ponto-e-vírgula. Os conteúdos deverão também ser obrigatoriamente colocados entre parênteses.

Os campos relacionados, quando houver, deverão ser definidos no final do registro, entre chaves  ( { } ). O campo relacionado da própria tabela alvo da transação é mencionado, aí vem um ponto-e-vírgula, abrem-se parênteses e aí, a exemplo dos campos e das chaves, começa uma lista de campos separados dos respectivos conteúdos por ponto-e-vírgula, sendo que os conteúdos também devem estar entre parênteses.

As linhas na cores amarela e azul utilizadas na demonstração do arquivo texto são apenas para mostrar a separação das linhas, evitando confusão visual.

2ª fase

Você aciona o Objeto 3871, selecionando as transações que deseja efetivar. Você poderá efetivar uma a uma ou todas de uma vez.

Após a importação, é importante que você acesse o Objeto 3872, onde agora haverá informação sobre eventuais registros rejeitados, com os respectivos motivos, que são os mesmos que seriam exibidos na tela se fosse feita a digitação normal.

Se houver algum campo com o conteúdo incorreto, você poderá gerar um arquivo texto apenas com os campos errados e executar a importação. Aí, você acessa o Objeto 3872, clica sobre o registro que tem a quantidade menor (e correta) de campos e o arrasta sobre a outra linha, aquela que contém a maioria dos campos. Será solicitada uma confirmação e os registros serão unificados, sendo gerado um novo registro, que conterá o conjunto união dos campos informados. 

Nota: Tome muito cuidado ao escolher o registro que será arrastado, pois se você arrastar o registro que tem a maioria dos dados sobre o que tem a menor quantidade, o novo registro consolidado conterá campos com o conteúdo antigo (errado). Tenha sempre em mente que o que o sistema faz é mover os campos comuns do registro arrastado para o registro que receberá o conteúdo.

Exemplo para a inserção de uma Grade:

Você importou esse registro:
19092;29250;(19970701)29260;(7)29280;(1004)29380;(3800){29240;(29224;(1)29222;(2))}

Percebeu que o cargo informado (Id 1004) não existe

Aí você gerou o registro de correção abaixo (Id do cargo = 21) e o importou:
19092;29280;(21){29240;(29224;(1)29222;(2))}

Agora você acessa o Objeto 3872, clica sobre o segundo registro e o arrasta sobre o primeiro. O resultado será um único registro, com todos os dados do primeiro, mas com o cargo corrigido.

Nota: Cuidado para não inverter o registro a ser arrastado, pois a inversão, neste caso, irá manter o erro do primeiro registro.


Depois que o sistema efetiva a importação, ele movimenta os registros que não tiverem gerado erros para as tabelas
HisInterfacesTransacoes
HisInterfacesTransacoesKs
HisInterfacesTransacoesCs
HisInterfacesTransacoesCsR

Isso evita que o repositório fique sobrecarregado com transações já efetivadas.

Interface básica

Veja abaixo 3 exemplos, um para cada um dos 3 tipos básicos de transação (Inclusão, Alteração e Exclusão):

Inclusão de 2 Verbas com os seguintes dados

Id do Campo
Nome do Campo
Conteúdo do 1º registro
Conteúdo do 2º registro
5780
VER_CdiVerba
4001
4002
5820
VER_CdiNaturezaVerba
1
1
6237
VER_CdiVerbaEspecie
19
19
5790
VER_D1sVerba
Horas Extras c/85%
Horas Extras c/90%
5800
VER_D1sVerbaRes
Hora Extra 85%  
Hora Extra 90%

Arquivo texto para essa atividade

15862;5780;(4001)5820;(1)6237;(19)5790;(Horas Extras com 85%)5800;(Hora Extra 85%)
15862;5780;(4002)5820;(1)6237;(19)5790;(Horas Extras com 90%)5800;(Hora Extra 90%)

Alteração da descrição da Verba 27 para Adicional Noturno 30%
Alteração da descrição da Verba 28 para Adicional de Transferência

Arquivo texto para essa atividade

15863;[5780;(27)]5790;(Adicional Noturno)5800;(Ad Noturno)
15863;[5780;(28)]5790;(Adicional de Transferência)5800;(Ad Transferência)

Exclusão da Verba 28

Arquivo texto para essa atividade

15864;[5780;(28)]

Essas 3 atividades podem ser executadas num único processo. Para isso, bastará somar os 3 arquivos, gerando apenas um arquivo, assim:

15862;5780;(4001)5820;(1)6237;(19)5790;(Horas Extras com 85%)5800;(Hora Extra 85%)
15862;5780;(4002)5820;(1)6237;(19)5790;(Horas Extras com 90%)5800;(Hora Extra 90%)
15863;[5780;(27)]5790;(Adicional Noturno)5800;(Ad Noturno)
15863;[5780;(28)]5790;(Adicional de Transferência)5800;(Ad Transferência)
15864;[5780;(28)]

Chave composta - 1º exemplo

Pode haver casos em que você precise alterar ou excluir um registro sem saber qual é o seu Id. Isso é possível, desde que haja na respectiva tabela um conjunto único de campos através do qual se possa identificar o registro. Um bom exemplo disso é a tabela ConPeriodosDescansos, que possui, dentre outros, um índice secundário e único composto pelos 3 campos abaixo:
CPD_CdiContratado
CPD_CdiTipoDescanso
CPD_DtdPeriodoInicio

Para facilitar a compreensão, listamos abaixo o Id e o nome dos 5 campos envolvidos no exemplo:
23785 - CPD_CdiConPeriodoDescanso
23790 - CPD_CdiContratado
23794 - CPD_CdiTipoDescanso
23800 - CPD_DtdPeriodoInicio
23844 - CPD_QtiDiasPendEmpresaDeve

Suponha que o Contratado 21 tenha os 4 períodos abaixo, todos com o campo CPD_CdiTipoDescanso  = 1 (Férias) e que você precise informar 20 dias no campo CPD_QtiDiasPendEmpresaDeve do período cujo Id é 79:

CPD_CdiConPeriodoDescanso
CPD_DtdPeriodoInicio
CPD_QtiDiasPendEmpresaDeve
717
01/01/1994   
0
 78
01/01/1995
0
 79
01/01/1996
0
 80
01/01/1997
0

Você poderá fazer isso de 2 maneiras:

Pelo Id
17593;[23785;(79)]23844;(20)

Pela chave composta
17593;[23790;(21)23794;(1)23800;(19960101)]23844;(20)

Chave composta - 2º exemplo

Suponha agora que você precise alterar o grau de instrução para 9 (curso superior) e o estado civil para 2 (casado) de um Dependente, mas não saiba o seu id. Você poderá informar um conjunto de campos, através do qual se chegue a um único registro.

Para facilitar a compreensão, listamos abaixo o Id e o nome dos 8 campos envolvidos no exemplo:
16650 - DEP_CdiConDependente
16652 - DEP_CdiContratado
16656 - DEP_CdiLigacaoPessoa
16668 - DEP_DssNome
16684 - DEP_CdiSexo
16686 - DEP_CdiEstadoCivil
16778 - DEP_DtdNascimentoData
16780 - DEP_CdiGrauInstrucao

Iremos utilizar os seguintes campos para que o sistema possa chegar ao registro desejado, que terá que ser único:
Campo 16652 - DEP_CdiContratado     = 2
Campo 16656 - DEP_CdiLigacaoPessoa  = 1 (filho ou filha)
Campo 16668 - DEP_DssNome           = Carlos Eduardo da Silva
Campo 16684 - DEP_CdiSexo           = 1 (masculino)
Campo 16778 - DEP_DtdNascimentoData = 10/06/1976

Para isso, você deverá configurar o arquivo texto assim:

16013;[16652;(2)16656;(1)16668;(Carlos Eduardo da Silva)16684;(1)16778;(19760610)]16780;(9)16686;(2)


O sistema atualizará o registro cujo id retornar no comando SQL abaixo:

select DEP_CdiConDependente
  from ConDependentes where DEP_CdiConDependente =
       (select min(DEP_CdiConDependente) from ConDependentes X
           where     DEP_CdiContratado     = 2
                 and DEP_CdiLigacaoPessoa  = 1
                 and DEP_DssNome           = 'Carlos Eduardo da Silva'
                 and DEP_CdiSexo           = 1
                 and DEP_DtdNascimentoData = '10-06-1976')

Nota: Se houver mais de um registro com o conjunto de campos idêntico, apenas o primeiro deles será considerado.


Supondo que se soubesse o Id e que ele fosse 5, você poderia ter configurado o arquivo texto assim:

16013;[16650;(5)]16780;(9)16686;(2)

Campos relacionados - 1º exemplo

Há casos em que você precisa inserir um registro numa tabela neta,  mas não sabe o Id da tabela filha. Para isso, existe o recurso da informação indireta, através de campos relacionados.

Um bom exemplo disso é a inserção de um registro na tabela ConGradesCargosSalarios, que é neta da tabela Contratados, sem que se saiba o id da tabela filha, que é a tabela ContratadosGrades.

Precisa-se, no caso desse exemplo, inserir em ConGradesCargosSalarios para a Grade de Cargo e Salário 1 do Contratado 2, um registro assim:

CGC_DtdInicioGrade     = 01/07/1997
CGC_CdiMotivoAltGrade  = 7
CGC_CdiCargo           = 21
CGC_VlnSalario         = 3800

Para isso, você deverá configurar o arquivo texto assim:

19092;29250;(19970701)29260;(7)29280;(21)29380;(3800)
{29240;(29224;(1)29222;(2))}

Note que, delimitados por chaves, estão os dados relacionados. A primeira informação é o id do campo da tabela onde se deseja inserir o registro que se relaciona com sua tabela mãe, que no caso é o campo 29240 (CGC_CdiContratadoGrade). Aí vem o ponto-e-vírgula separador, abre-se parênteses e se coloca a lista de campos com os respectivos conteúdos da tabela intermediária, que no caso é:
29224 (CRS_CdiGradeCargoSalario) = 1 e
29222 (CRS_CdiContratado)        = 2

Para facilitar a compreensão, listamos abaixo o Id e o nome dos campos envolvidos no exemplo:

Tabela ConGradesCargosSalarios

Campo 29240 = CGC_CdiContratadoGrade
Campo 29250 = CGC_DtdInicioGrade
Campo 29260 = CGC_CdiMotivoAltGrade
Campo 29280 = CGC_CdiCargo
Campo 29380 = CGC_VlnSalario

Tabela ContratadosGrades

Campo 29220 = CRS_CdiContratadoGrade
Campo 29222 = CRS_CdiContratado
Campo 29224 = CRS_CdiGradeCargoSalario

Campos relacionados - 2º exemplo

Você quer inserir uma programação de Férias e não sabe o id do respectivo período, mas sabe quem é o Contratado, sabe que o Tipo de Descanso é 1 (Férias) e sabe que a data de início do período aquisitivo é 01/01/1996.

Os dados da programação de férias são esses:

CPI_CdiModoDescanso_P = 1 (Normais)
CPI_QtiDiasFerias_P   = 30
CPI_DtdSaidaFerias_P  = 21/07/1997

Para isso, você deverá configurar o arquivo texto assim:

23612;24010;(1)24013;(30)24021;(19970721){23990;(23790;(21)23794;(1)23800;(19960101))}

Para facilitar a compreensão, listamos abaixo o Id e o nome dos campos envolvidos no exemplo:


Tabela ConPeriodosDescansos

Campo 23785 - CPD_CdiConPeriodoDescanso
Campo 23790 - CPD_CdiContratado
Campo 23794 - CPD_CdiTipoDescanso
Campo 23796 - CPD_CdiPeriodoDescanso
Campo 23800 - CPD_DtdPeriodoInicio

Tabela ConPeriodosDescansosIts

Campo 23980 - CPI_CdiConPeriodoDescansoIt
Campo 23990 - CPI_CdiConPeriodoDescanso
Campo 24010 - CPI_CdiModoDescanso_P
Campo 24013 - CPI_QtiDiasFerias_P
Campo 24021 - CPI_DtdSaidaFerias_P

Campos relacionados - 3º exemplo

Suponha que você precise inserir registros nas tabelas PlsMetasEstrs, 
PlsMetasEstrsxMetas e  PlsMetasEstrsxMetasIts (Objeto 308), informando apenas os Ids significativos da tabela-mãe, que é  PlsMetasEstrs:
   Id do Plano de Metas
   Id do Nível de Estrutura
   Id da Periodicidade
   Id do Local

Apresentação de um campo por linha, para facilitar a compreensão:

54262;                    Transação de Inserção em PlsMetasEstrs
29171;(0)                 BAF_CdiPlMetaEstr
29172;(3)                 BAF_CdiPlMeta
29173;(7)                 BAF_CdiNivelEstrutura
29174;(4)                 BAF_CdiPeriodicidade
29182;(1)                 BAF_CdiLocal
29204;(3)                 BAF_CdiHierarquia_Avaliador
29206;(8)                 BAF_CdiHierarquia_Aprovador
29207;(21)                BAF_CdiContratado_Proponente 
 
54272;                    Transação de Inserção em PlsMetasEstrsxMetas
29213;(0)                 BAG_CdiPlMetaEstrxMeta
29221;(1)                 BAG_CdiMeta
29234;(Teste de Inserção) BAG_D1sPlMetaEstrxMeta
{29215;(                  BAG_CdiPlMetaEstr
29172;(3)                 BAF_CdiPlMeta
29173;(7)                 BAF_CdiNivelEstrutura
29174;(4)                 BAF_CdiPeriodicidade
29182;(1))}               BAF_CdiLocal

54282;                    Transação de Inserção em PlsMetasEstrsxMetasIts
29252;(0)                 BAH_CdiPlMetaEstrxMetaIt
29254;(2007)              BAH_DtiAno
29255;(3)                 BAH_CdiMes
29257;(15130.45)          BAH_VlnReal
29259;(15.41)             BAH_PcnReal
29262;(14)                BAH_QtnReal
{29253;(                  BAH_CdiPlMetaEstrxMeta
29172;(3)                 BAF_CdiPlMeta
29173;(7)                 BAF_CdiNivelEstrutura
29174;(4)                 BAF_CdiPeriodicidade
29182;(1))}               BAF_CdiLocal

Prefixos das tabelas:
BAF = PlsMetasEstrs
BAG = PlsMetasEstrsxMetas
BAH = PlsMetasEstrsxMetasIts


Eis o mesmo arquivo do exemplo acima, mas no formato final, que é o que sistema utilizará para a execução da importação:

54262;29171;(0)29172;(3)29173;(7)29174;(4)29182;(1)29204;(3)29206;(8)29207;(21)
54272;29213;(0)29221;(1)29234;(Teste de Inserção){29215;(29172;(3)29173;(7)29174;(4)29182;(1))}
54282;29252;(0)29254;(2007)29255;(3)29257;(15130.45)29259;(15.41)29262;(14){29253;(29172;(3)29173;(7)29174;(4)29182;(1))}


Campos blob

Você pode importar também o conteúdo de campos blob, contendo textos longos ou imagens. Para isso, gere um arquivo separado para cada um dos campos blob de cada um dos registros que for importar e no arquivo texto, no lugar do conteúdo do campo, que vai entre parênteses, escreva o nome do arquivo texto correspondente, que obviamente terá que estar presente na pasta Workin do Usuário, juntamente com o arquivo texto.

Assim, se você for importar 10 registros e cada um contiver dois campos blob, terão que estar presentes na pasta Workin do Usuário 21 arquivos, sendo 20 dos campos blob e o próprio arquivo texto da interface.

Veja abaixo um exemplo prático de um arquivo para importação da foto dos Contratados 21 e 1003:

15953;10430;(21)9410;(Foto_do_Contratado_21.jpg)
15953;10430;(1003)9410;(Foto_do_Contratado_1003.jpg)

15953 é o Id da Transação de alteração de Contratados, Objeto 1106;
10430 é o Id do campo CON_CdiContratado;
9410 é o Id do campo CON_DsbFoto.

Neste caso, além do próprio arquivo texto da interface (com duas linhas), o sistema procurará pelos dois arquivos abaixo na pasta Workin do Usuário:
   Foto_do_Contratado_21.jpg
   Foto_do_Contratado_1003.jpg


Valores nulos em campos do tipo Data e Data/Hora

Para modificar o valor de um campo data ou data/hora para nulo, ou mesmo para usar este valor nulo numa chave de relacionamento de registros, basta informar 8 caracteres 0 (zero) no valor do campo, conforme exemplo abaixo:
23183;[29220;(231403)]29225;(00000000)

O campo 29225 - CRS_DtdFimGradeLiberacao reconhecerá estes zeros como nulo.

Outro exemplo abaixo refere-se a relacionamento:

19092;29250;(20090701)29260;(1145)96995;(2){29240;(29224;(1)29222;
(3)35236;(00000000))}

O trecho acima (que está entre chaves no arquivo de importação) pede que o campo 29240 seja preenchido com o retorno abaixo:

Campo 29224 preenchido com valor 1    - CRS_CdiGradeCargoSalario
Campo 29222 preenchido com valor 3 - CRS_CdiContratado
Campo 35236 preenchido com valor nulo - CRS_DtdFimGradeLiberacao

Ou seja:

SELECT CRS_CdiContratadoGrade
FROM ContratadosGrades
WHERE CRS_CdiGradeCargoSalario = 1
AND CRS_CdiContratado = 3
AND CRS_DtdFimGradeLiberacao IS NULL

A combinação acima retornará um Id de Contratado Grade que será informado no campo 29240 na inclusão deste registro.
