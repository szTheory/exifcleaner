# See the bottom of this file for the POD documentation.  Search for the
# string '=head'.

#######################################################################
#
# Win32::API - Perl Win32 API Import Facility
#
# Author: Aldo Calpini <dada@perl.it>
# Maintainer: Cosimo Streppone <cosimo@cpan.org>
#
# Changes for gcc/cygwin: Daniel Risacher <magnus@alum.mit.edu>
#  ported from 0.41 based on Daniel's patch by Reini Urban <rurban@x-ray.at>
#
#######################################################################

package Win32::API;
    use strict;
    use warnings;
BEGIN {
    require Exporter;      # to export the constants to the main:: space

    sub ISCYG ();
    if($^O eq 'cygwin') {
        BEGIN{warnings->unimport('uninitialized')}
        die "Win32::API on Cygwin requires the cygpath tool on PATH"
            if index(`cygpath --help`,'Usage: cygpath') == -1;
        require File::Basename;
        eval "sub ISCYG () { 1 }";
    } else {
        eval "sub ISCYG () { 0 }";
    }


    use vars qw( $DEBUG $sentinal @ISA @EXPORT_OK $VERSION );

    @ISA = qw( Exporter );
    @EXPORT_OK = qw( ReadMemory IsBadReadPtr MoveMemory
    WriteMemory SafeReadWideCString ); # symbols to export on request

    use Scalar::Util qw( looks_like_number weaken);
    
    sub ERROR_NOACCESS	() { 998 }
    sub ERROR_NOT_ENOUGH_MEMORY () { 8 }
    sub ERROR_INVALID_PARAMETER () { 87 }
    sub APICONTROL_CC_STD	() { 0 }
    sub APICONTROL_CC_C	() { 1 }
    sub APICONTROL_CC_mask  () { 0x7 }
    sub APICONTROL_UseMI64	() { 0x8 }
    sub APICONTROL_is_more	() { 0x10 }
    sub APICONTROL_has_proto() { 0x20 }
    eval ' *Win32::API::Type::PTRSIZE = *Win32::API::More::PTRSIZE = *PTRSIZE = sub () { '.length(pack('p', undef)).' };'.
          #Win64 added in 5.7.3
         ' *Win32::API::Type::IVSIZE = *Win32::API::More::IVSIZE = *IVSIZE = sub () { '.length(pack($] >= 5.007003 ? 'J' : 'I' ,0)).' };'.
         ' *Win32::API::Type::DEBUGCONST = *Win32::API::Struct::DEBUGCONST = *DEBUGCONST = sub () { '.(!!$DEBUG+0).' };'
}

sub DEBUG {
    #checking flag redundant now, but keep in case of an accidental unprotected call
    if ($Win32::API::DEBUG) {
        printf @_ if @_ or return 1;
    }
    else {
        return 0;
    }
}

use Win32::API::Type ();
use Win32::API::Struct ();

#######################################################################
# STATIC OBJECT PROPERTIES
#
#### some package-global hash to
#### keep track of the imported
#### libraries and procedures
my %Libraries  = ();
my %Procedures = ();


#######################################################################
# dynamically load in the API extension module.
# BEGIN required for constant subs in BOOT:
BEGIN {
    $VERSION = '0.84';
    require XSLoader;
    XSLoader::load 'Win32::API', $VERSION;
}

#######################################################################
# PUBLIC METHODS
#
sub new {
    die "Win32::API/More::new/Import is a class method that takes 2 to 6 parameters, see POD"
        if @_ < 3 || @_ > 7;
    my ($class, $dll, $hproc, $ccnum, $outnum) = (shift, shift);
    if(! defined $dll){
        $hproc = shift;
    }
    my ($proc, $in, $out, $callconvention) = @_;
    my ($hdll, $freedll, $proto, $stackunwind) = (0, 0, 0, 0);
    my $self = {};
    if(! defined $hproc){
        if (ISCYG() and $dll ne File::Basename::basename($dll)) {
    
            # need to convert $dll to win32 path
            # isn't there an API for this?
            my $newdll = `cygpath -w "$dll"`;
            chomp $newdll;
            DEBUG "(PM)new: converted '$dll' to\n  '$newdll'\n" if DEBUGCONST;
            $dll = $newdll;
        }
    
        #### avoid loading a library more than once
        if (exists($Libraries{$dll})) {
            DEBUG "Win32::API::new: Library '$dll' already loaded, handle=$Libraries{$dll}\n" if DEBUGCONST;
            $hdll = $Libraries{$dll};
        }
        else {
            DEBUG "Win32::API::new: Loading library '$dll'\n" if DEBUGCONST;
            $hdll = Win32::API::LoadLibrary($dll);
            $freedll = 1;
    #        $Libraries{$dll} = $hdll;
        }
    
        #### if the dll can't be loaded, set $! to Win32's GetLastError()
        if (!$hdll) {
            $! = Win32::GetLastError();
            DEBUG "FAILED Loading library '$dll': $^E\n" if DEBUGCONST;
            return undef;
        }
    }
    else{
        if(!looks_like_number($hproc) || IsBadReadPtr($hproc, 4)){
            Win32::SetLastError(ERROR_NOACCESS);
            DEBUG "FAILED Function pointer '$hproc' is not a valid memory location\n" if DEBUGCONST;
            return undef;
        }
    }
    #### determine if we have a prototype or not, outtype is for future use in XS
    if ((not defined $in) and (not defined $out)) {
        ($proc, $self->{in}, $self->{intypes}, $outnum, $self->{outtype},
         $ccnum) = parse_prototype($class, $proc);
        if( ! $proc ){
            Win32::API::FreeLibrary($hdll) if $freedll;
            Win32::SetLastError(ERROR_INVALID_PARAMETER);
            return undef;
        }
        $proto = 1;
    }
    else {
        $self->{in} = [];
        my $self_in = $self->{in}; #avoid hash derefing
        if (ref($in) eq 'ARRAY') {
            foreach (@$in) {
                push(@{$self_in}, $class->type_to_num($_));
            }
        }
        else {
            my @in = split '', $in;
            foreach (@in) {
                push(@{$self_in}, $class->type_to_num($_));
            }
        }#'V' must be one and ONLY letter for "in"
        foreach(@{$self_in}){
            if($_ == 0){ 
                if(@{$self_in} != 1){
                    Win32::API::FreeLibrary($hdll) if $freedll;
                    die "Win32::API 'V' for in prototype must be the only parameter";
                } else {undef(@{$self_in});} #empty arr, as if in param was ""
            }
        }
        $outnum   = $class->type_to_num($out, 1);
        $ccnum = calltype_to_num($callconvention);
    }

    if(!$hproc){ #if not non DLL func
        #### first try to import the function of given name...
        $hproc = Win32::API::GetProcAddress($hdll, $proc);
    
        #### ...then try appending either A or W (for ASCII or Unicode)
        if (!$hproc) {
            my $tproc = $proc;
            $tproc .= (IsUnicode() ? "W" : "A");
    
            # print "Win32::API::new: procedure not found, trying '$tproc'...\n";
            $hproc = Win32::API::GetProcAddress($hdll, $tproc);
        }
    
        #### ...if all that fails, give up, $! setting is back compat, $! is deprecated
        if (!$hproc) {
            my $err = $! = Win32::GetLastError();
            DEBUG "FAILED GetProcAddress for Proc '$proc': $^E\n" if DEBUGCONST;
            Win32::API::FreeLibrary($hdll) if $freedll;
            Win32::SetLastError($err);
            return undef;
        }
        DEBUG "GetProcAddress('$proc') = '$hproc'\n" if DEBUGCONST;
    }
    else {
        DEBUG "Using non-DLL function pointer '$hproc' for '$proc'\n" if DEBUGCONST;
    }
    if(PTRSIZE == 4 && $ccnum == APICONTROL_CC_C) {#fold out on WIN64
        #calculate add to ESP amount, in units of 4, will be *4ed later
        $stackunwind += $_ == T_QUAD || $_ == T_DOUBLE ? 2 : 1 for(@{$self->{in}});
        if($stackunwind > 0xFFFF) {
            goto too_many_in_params;
        }
    }
    # if a prototype has 8 byte types on 32bit, $stackunwind will be higher than
    # length of {in} letter array, so 2 different checks need to be done
    if($#{$self->{in}} > 0xFFFF) {
        too_many_in_params:
        DEBUG "FAILED This function has too many parameters (> ~65535) \n" if DEBUGCONST;
        Win32::API::FreeLibrary($hdll) if $freedll;
        Win32::SetLastError(ERROR_NOT_ENOUGH_MEMORY);
        return undef;
    }
    #### ok, let's stuff the object
    $self->{procname} = $proc;
    $self->{dll}      = $hdll;
    $self->{dllname}  = $dll;

    $outnum &= ~T_FLAG_NUMERIC;
    my $control;
    $self->{weakapi} = \$control;
    weaken($self->{weakapi});
    $control = pack(         'L'
                             .'L'
                             .(PTRSIZE == 8 ? 'Q' : 'L')
                             .(PTRSIZE == 8 ? 'Q' : 'L')
                             .(PTRSIZE == 8 ? 'Q' : 'L')
                             .(PTRSIZE == 8 ? '' : 'L')
                        ,($class eq "Win32::API::More" ? APICONTROL_is_more : 0)
                        | ($proto ? APICONTROL_has_proto : 0)
                        | $ccnum
                        | (PTRSIZE == 8 ? 0 :  $stackunwind << 8)
                        | $outnum << 24
                        , scalar(@{$self->{in}}) * PTRSIZE #in param count, in SV * units
                        , $hproc
                        , \($self->{weakapi})+0 #weak api obj ref
                        , (exists $self->{intypes} ? ($self->{intypes})+0 : 0)
                        , 0); #padding to align to 8 bytes on 32 bit only
    #align to 16 bytes
    $control .= "\x00" x ((((length($control)+ 15) >> 4) << 4)-length($control));
    #make a APIPARAM template array
    my ($i, $arr_end) = (0, scalar(@{$self->{in}}));
    for(; $i< $arr_end; $i++) {
        my $tin = $self->{in}[$i];
        #unsigned meaningless no sign vs zero extends are done bc uv/iv is
        #the biggest native integer on the cpu, big to small is truncation
        #numeric is implemented as T_NUMCHAR for in, keeps asm jumptable clean
        $tin &= ~(T_FLAG_UNSIGNED|T_FLAG_NUMERIC);
        $tin--; #T_VOID doesn't exist as in param in XS
        #put index of param array slice in unused space for croaks, why not?
        $control .= "\x00" x 8 . pack('CCSSS', $tin, 0, 0, $i, $i+1);
    }
    _Align($control, 16); #align the whole PVX to 16 bytes for SSE moves

    #### keep track of the imported function
    if(defined $dll){
        $Libraries{$dll} = $hdll;
        $Procedures{$dll}++;
    }
    DEBUG "Object blessed!\n" if DEBUGCONST;

    my $ref = bless(\$control, $class);
    SetMagicSV($ref, $self);
    return $ref;
}

sub Import {
    my $closure = shift->new(@_)
        or return undef;
    my $procname = ${Win32::API::GetMagicSV($closure)}{procname};
    #dont allow "sub main:: {0;}"
    Win32::SetLastError(ERROR_INVALID_PARAMETER), return undef if $procname eq '';
    _ImportXS($closure, (caller)[0].'::'.$procname);
    return $closure;
}

#######################################################################
# PRIVATE METHODS
#
sub DESTROY {
    my ($self) = GetMagicSV($_[0]);

    return if ! defined $self->{dllname};
    #### decrease this library's procedures reference count
    $Procedures{$self->{dllname}}--;

    #### once it reaches 0, free it
    if ($Procedures{$self->{dllname}} == 0) {
        DEBUG "Win32::API::DESTROY: Freeing library '$self->{dllname}'\n" if DEBUGCONST;
        Win32::API::FreeLibrary($Libraries{$self->{dllname}});
        delete($Libraries{$self->{dllname}});
    }
}

# Convert calling convention string (_cdecl|__stdcall)
# to a C const. Unknown counts as __stdcall
#
sub calltype_to_num {
    my $type = shift;

    if (!$type || $type eq "__stdcall" || $type eq "WINAPI" || $type eq "NTAPI"
        || $type eq "CALLBACK"  ) {
        return APICONTROL_CC_STD;
    }
    elsif ($type eq "_cdecl" || $type eq "__cdecl" || $type eq "WINAPIV") {
        return APICONTROL_CC_C;
    }
    else {
        warn "unknown calling convention: '$type'";
        return APICONTROL_CC_STD;
    }
}


sub type_to_num {
    die "wrong class" if shift ne "Win32::API";
    my $type = shift;
    my $out  = shift;
    my ($num, $numeric);
    if(index($type, 'num', 0) == 0){
        substr($type, 0, length('num'), '');
        $numeric = 1;
    }
    else{
        $numeric = 0;
    }

    if (   $type eq 'N'
        or $type eq 'n'
        or $type eq 'l'
        or $type eq 'L'
        or ( PTRSIZE == 8  and $type eq 'Q' || $type eq 'q'))
    {
        $num = T_NUMBER;
    }
    elsif ($type eq 'P'
        or $type eq 'p')
    {
        $num = T_POINTER;
    }
    elsif ($type eq 'I'
        or $type eq 'i')
    {
        $num = T_INTEGER;
    }
    elsif ($type eq 'f'
        or $type eq 'F')
    {
        $num = T_FLOAT;
    }
    elsif ($type eq 'D'
        or $type eq 'd')
    {
        $num = T_DOUBLE;
    }
    elsif ($type eq 'c'
        or $type eq 'C')
    {
        $num = $numeric ? T_NUMCHAR : T_CHAR;
    }
    elsif (PTRSIZE == 4 and $type eq 'q' || $type eq 'Q')
    {
        $num = T_QUAD;
    }
    elsif($type eq '>'){
        die "Win32::API does not support pass by copy structs as function arguments";
    }
    else {
        $num = T_VOID; #'V' takes this branch, which is T_VOID in C
    }#not valid return types of the C func
    if(defined $out) {#b/B remains private/undocumented
        die "Win32::API invalid return type, structs and ".
        "callbacks as return types not supported"
            if($type =~ m/^s|S|t|T|b|B|k|K$/);
    }
    else {#in type
        if ($type eq 's' or $type eq 'S' or $type eq 't' or $type eq 'T')
        {
            $num = T_STRUCTURE;
        }
        elsif ($type eq 'b'
            or $type eq 'B')
        {
            $num = T_POINTERPOINTER;
        }
        elsif ($type eq 'k'
            or $type eq 'K')
        {
            $num = T_CODE;
        }
    }
    $num |= T_FLAG_NUMERIC if $numeric;
    return $num;
}

package Win32::API::More;

use vars qw( @ISA );
@ISA = qw ( Win32::API );
sub type_to_num {
    die "wrong class" if shift ne "Win32::API::More";
    my $type = shift;
    my $out  = shift;
    my ($num, $numeric);
    if(index($type, 'num', 0) == 0){
        substr($type, 0, length('num'), '');
        $numeric = 1;
    }
    else{
        $numeric = 0;
    }

    if (   $type eq 'N'
        or $type eq 'n'
        or $type eq 'l'
        or $type eq 'L'
        or ( PTRSIZE == 8  and $type eq 'Q' || $type eq 'q')
        or (! $out and  # in XS short 'in's are interger/numbers code
            $type eq 'S'
            || $type eq 's'))
    {
        $num = Win32::API::T_NUMBER;
        if(defined $out && ($type eq 'N' || $type eq 'L'
                        ||  $type eq 'S' || $type eq 'Q')){
            $num |= Win32::API::T_FLAG_UNSIGNED;
        }
    }
    elsif ($type eq 'P'
        or $type eq 'p')
    {
        $num = Win32::API::T_POINTER;
    }
    elsif ($type eq 'I'
        or $type eq 'i')
    {
        $num = Win32::API::T_INTEGER;
        if(defined $out && $type eq 'I'){
            $num |= Win32::API::T_FLAG_UNSIGNED;
        }
    }
    elsif ($type eq 'f'
        or $type eq 'F')
    {
        $num = Win32::API::T_FLOAT;
    }
    elsif ($type eq 'D'
        or $type eq 'd')
    {
        $num = Win32::API::T_DOUBLE;
    }
    elsif ($type eq 'c'
        or $type eq 'C')
    {
        $num = $numeric ? Win32::API::T_NUMCHAR : Win32::API::T_CHAR;
        if(defined $out && $type eq 'C'){
            $num |= Win32::API::T_FLAG_UNSIGNED;
        }
    }
    elsif (PTRSIZE == 4 and $type eq 'q' || $type eq 'Q')
    {
        $num = Win32::API::T_QUAD;
        if(defined $out && $type eq 'Q'){
            $num |= Win32::API::T_FLAG_UNSIGNED;
        }
    }
    elsif ($type eq 's') #4 is only used for out params
    {
        $num = Win32::API::T_SHORT;
    }
    elsif ($type eq 'S')
    {
        $num = Win32::API::T_SHORT | Win32::API::T_FLAG_UNSIGNED;
    }
    elsif($type eq '>'){
        die "Win32::API does not support pass by copy structs as function arguments";
    }
    else {
        $num = Win32::API::T_VOID; #'V' takes this branch, which is T_VOID in C
    } #not valid return types of the C func
    if(defined $out) {#b/B remains private/undocumented
        die "Win32::API invalid return type, structs and ".
        "callbacks as return types not supported"
            if($type =~ m/^t|T|b|B|k|K$/);
    }
    else {#in type
        if (   $type eq 't'
            or $type eq 'T')
        {
            $num = Win32::API::T_STRUCTURE;
        }
        elsif ($type eq 'b'
            or $type eq 'B')
        {
            $num = Win32::API::T_POINTERPOINTER;
        }
        elsif ($type eq 'k'
            or $type eq 'K')
        {
            $num = Win32::API::T_CODE;
        }
    }
    $num |= Win32::API::T_FLAG_NUMERIC if $numeric;
    return $num;
}
package Win32::API;

sub parse_prototype {
    my ($class, $proto) = @_;

    my @in_params = ();
    my @in_types  = (); #one day create a BNF-ish formal grammer parser here
    if ($proto =~ /^\s*((?:(?:un|)signed\s+|) #optional signedness
        \S+)(?:\s*(\*)\s*|\s+) #type and maybe a *
        (?:(\w+)\s+)? # maybe a calling convention
        (\S+)\s* #func name
        \(([^\)]*)\) #param list
        /x) {
        my $ret            = $1.(defined($2)?$2:'');
        my $callconvention = $3;
        my $proc           = $4;
        my $params         = $5;

        $params =~ s/^\s+//;
        $params =~ s/\s+$//;

        DEBUG "(PM)parse_prototype: got PROC '%s'\n",   $proc if DEBUGCONST;
        DEBUG "(PM)parse_prototype: got PARAMS '%s'\n", $params if DEBUGCONST;
        
        foreach my $param (split(/\s*,\s*/, $params)) {
            my ($type, $name);
            #match "in_t* _var" "in_t * _var" "in_t *_var" "in_t _var" "in_t*_var" supported
            #unsigned or signed or nothing as prefix supported
            # "in_t ** _var" and "const in_t* var" not supported
            if ($param =~ /((?:(?:un|)signed\s+|)\w+)(?:\s*(\*)\s*|\s+)(\w+)/) {
                ($type, $name) = ($1.(defined($2)? $2:''), $3);
            }
            {
                BEGIN{warnings->unimport('uninitialized')}
                if($type eq '') {goto BADPROTO;} #something very wrong, bail out
            }
            my $packing = Win32::API::Type::packing($type);
            if (defined $packing && $packing ne '>') {
                if (Win32::API::Type::is_pointer($type)) {
                    DEBUG "(PM)parse_prototype: IN='%s' PACKING='%s' API_TYPE=%d\n",
                        $type,
                        $packing,
                        $class->type_to_num('P') if DEBUGCONST;
                    push(@in_params, $class->type_to_num('P'));
                }
                else {
                    DEBUG "(PM)parse_prototype: IN='%s' PACKING='%s' API_TYPE=%d\n",
                        $type,
                        $packing,
                        $class->type_to_num(Win32::API::Type->packing($type, undef, 1)) if DEBUGCONST;
                    push(@in_params, $class->type_to_num(Win32::API::Type->packing($type, undef, 1)));
                }
            }
            elsif (Win32::API::Struct::is_known($type)) {
                DEBUG "(PM)parse_prototype: IN='%s' PACKING='%s' API_TYPE=%d\n",
                    $type, 'T', Win32::API::More->type_to_num('T') if DEBUGCONST;
                push(@in_params, Win32::API::More->type_to_num('T'));
            }
            else {
                warn
                    "Win32::API::parse_prototype: WARNING unknown parameter type '$type'";
                push(@in_params, $class->type_to_num('I'));
            }
            push(@in_types, $type);

        }
        DEBUG "parse_prototype: IN=[ @in_params ]\n" if DEBUGCONST;


        if (Win32::API::Type::is_known($ret)) {
            if (Win32::API::Type::is_pointer($ret)) {
                DEBUG "parse_prototype: OUT='%s' PACKING='%s' API_TYPE=%d\n",
                    $ret,
                    Win32::API::Type->packing($ret),
                    $class->type_to_num('P') if DEBUGCONST;
                return ($proc, \@in_params, \@in_types, $class->type_to_num('P', 1),
                    $ret, calltype_to_num($callconvention));
            }
            else {
                DEBUG "parse_prototype: OUT='%s' PACKING='%s' API_TYPE=%d\n",
                    $ret,
                    Win32::API::Type->packing($ret),
                    $class->type_to_num(Win32::API::Type->packing($ret, undef, 1), 1) if DEBUGCONST;
                return (
                    $proc, \@in_params, \@in_types,
                    $class->type_to_num(Win32::API::Type->packing($ret, undef, 1), 1),
                    $ret, calltype_to_num($callconvention)
                );
            }
        }
        else {
            warn
                "Win32::API::parse_prototype: WARNING unknown output parameter type '$ret'";
            return ($proc, \@in_params, \@in_types, $class->type_to_num('I', 1),
                $ret, calltype_to_num($callconvention));
        }

    }
    else {
        BADPROTO:
        warn "Win32::API::parse_prototype: bad prototype '$proto'";
        return undef;
    }
}

#
# XXX hack, see the proper implementation in TODO
# The point here is don't let fork children free the parent's DLLs.
# CLONE runs on ::API and ::More, that's bad and causes a DLL leak, make sure
# CLONE dups the DLL handles only once per CLONE
# GetModuleHandleEx was not used since that is a WinXP and newer function, not Win2K.
# GetModuleFileName was used to get full DLL pathname incase SxS/multiple DLLs
# with same file name exist in the process. Even if the dll was loaded as a
# relative path initially, later SxS can load a DLL with a different full path
# yet same file name, and then LoadLibrary'ing the original relative path
# might increase the refcount on the wrong DLL or return a different HMODULE
sub CLONE { 
    return if $_[0] ne "Win32::API";
    
    _my_cxt_clone();
    foreach( keys %Libraries){
        if($Libraries{$_} != Win32::API::LoadLibrary(Win32::API::GetModuleFileName($Libraries{$_}))){
            die "Win32::API::CLONE unable to clone DLL \"$Libraries{$_}\" Unicode Problem??";
        }
    }
}

1;

__END__

#######################################################################
# DOCUMENTATION
#

=head1 NAME

Win32::API - Perl Win32 API Import Facility

=head1 SYNOPSIS

  #### Method 1: with prototype

  use Win32::API;
  $function = Win32::API::More->new(
      'mydll', 'int sum_integers(int a, int b)'
  );
  #### $^E is non-Cygwin only
  die "Error: $^E" if ! $function;
  #### or on Cygwin and non-Cygwin
  die "Error: ".(Win32::FormatMessage(Win32::GetLastError())) if ! $function;
  ####
  $return = $function->Call(3, 2);

  #### Method 2: with prototype and your function pointer

  use Win32::API;
  $function = Win32::API::More->new(
      undef, 38123456, 'int name_ignored(int a, int b)'
  );
  die "Error: $^E" if ! $function; #$^E is non-Cygwin only
  $return = $function->Call(3, 2);

  #### Method 3: with parameter list 
  
  use Win32::API;
  $function = Win32::API::More->new(
      'mydll', 'sum_integers', 'II', 'I'
  );
  die "Error: $^E" if ! $function; #$^E is non-Cygwin only
  $return = $function->Call(3, 2);
     
  #### Method 4: with parameter list and your function pointer
  
  use Win32::API;
  $function = Win32::API::More->new(
      undef, 38123456, 'name_ignored', 'II', 'I'
  );
  die "Error: $^E" if ! $function; #$^E is non-Cygwin only
  $return = $function->Call(3, 2);
  
  #### Method 5: with Import (slightly faster than ->Call)
 
  use Win32::API;
  $function = Win32::API::More->Import(
      'mydll', 'int sum_integers(int a, int b)'
  );
  die "Error: $^E" if ! $function; #$^E is non-Cygwin only
  $return = sum_integers(3, 2);


=for LATER-UNIMPLEMENTED
  #### or
  use Win32::API mydll => 'int sum_integers(int a, int b)';
  $return = sum_integers(3, 2);


=head1 ABSTRACT

With this module you can import and call arbitrary functions
from Win32's Dynamic Link Libraries (DLL) or arbitrary functions for
which you have a pointer (MS COM, etc), without having
to write an XS extension. Note, however, that this module 
can't do everything. In fact, parameters input and output is
limited to simpler cases.

A regular B<XS> extension is always safer and faster anyway.

The current version of Win32::API is always available at your
nearest CPAN mirror:

  http://search.cpan.org/dist/Win32-API/

A short example of how you can use this module (it just gets the PID of 
the current process, eg. same as Perl's internal C<$$>):

    use Win32::API;
    Win32::API::More->Import("kernel32", "int GetCurrentProcessId()");
    $PID = GetCurrentProcessId();

Starting with 0.69. Win32::API initiated objects are deprecated due to numerous
bugs and improvements, use Win32::API::More now. The use statement remains
as C<use Win32::API;>.

The possibilities are nearly infinite (but not all are good :-).
Enjoy it.

=head1 DESCRIPTION

To use this module put the following line at the beginning of your script:

    use Win32::API;

You can now use the C<new()> function of the Win32::API module to create a
new Win32::API::More object (see L<IMPORTING A FUNCTION>) and then invoke the 
C<Call()> method on this object to perform a call to the imported API
(see L<CALLING AN IMPORTED FUNCTION>).

Starting from version 0.40, you can also avoid creating a Win32::API::More object
and instead automatically define a Perl sub with the same name of the API
function you're importing. This 2nd way using C<Import> to create a sub instead
of an object is slightly faster than doing C<-E<gt>Call()>. The details of the
API definitions are the same, just the method name is different:

    my $GetCurrentProcessId = Win32::API::More->new(
        "kernel32", "int GetCurrentProcessId()"
    );
    die "Failed to import GetCurrentProcessId" if !$GetCurrentProcessId;
    $GetCurrentProcessId->UseMI64(1);
    my $PID = $GetCurrentProcessId->Call();

    #### vs.

    my $UnusedGCPI = Win32::API::More->Import("kernel32", "int GetCurrentProcessId()");
    die "Failed to import GetCurrentProcessId" if !$UnusedGCPI;
    $UnusedGCPI->UseMI64(1);
    $PID = GetCurrentProcessId();

Note that C<Import> returns the Win32::API obj on success and false on failure
(in which case you can check the content of C<$^E>). This allows some settings
to be set through method calls that can't be specified as a parameter to Import,
yet still have the convience of not writing C<-E<gt>Call()>. The Win32::API obj
does not need to be assigned to a scalar. C<unless(Win32::API::More-E<gt>Import>
is fine. Prior to v0.76_02, C<Import> returned returned 1 on success and 0 on
failure.

=head2 IMPORTING A FUNCTION

You can import a function from a 32 bit Dynamic Link Library (DLL) file with
the C<new()> function or, starting in 0.69, supply your own function pointer.
This will create a Perl object that contains the reference to that function,
which you can later C<Call()>.

What you need to know is the prototype of the function you're going to import
(eg. the definition of the function expressed in C syntax).

Starting from version 0.40, there are 2 different approaches for this step:
(the preferred) one uses the prototype directly, while the other (now deprecated)
one uses Win32::API's internal representation for parameters.

=head2 IMPORTING A FUNCTION BY PROTOTYPE

You need to pass 2 or 3 parameters:

=over 4

=item 1.

The name of the library from which you want to import the function. If the
name is undef, you are requesting a object created from a function pointer,
and must supply item 2.

=item 2.

This parameter is optional, most people should skip it, skip does not mean
supplying undef. Supply a function pointer in the format of number 1234, not
string "\x01\x02\x03\x04". Undef will be returned if the pointer is not
readable, L<Win32::GetLastError|Win32/Win32::GetLastError()>/L<perlvar/"$^E">
will be C<ERROR_NOACCESS>.

=item 3.

The C prototype of the function. If you are using a function pointer, the name
of the function should be something "friendly" to you and no attempt is made
to retrieve such a name from any DLL's export table. This name for a function
pointer is also used for Import().

=back

When calling a function imported with a prototype, if you pass an
undefined Perl scalar to one of its arguments, it will be
automatically turned into a C C<NULL> value.

See L<Win32::API::Type> for a list of the known parameter types and
L<Win32::API::Struct> for information on how to define a structure.

If a prototype type is exactly C<signed char> or C<unsigned char> for an 
"in" parameter or the return parameter, and for "in" parameters only
C<signed char *> or C<unsigned char *> the parameters will be treated as a
number, C<0x01>, not C<"\x01">. "UCHAR" is not "unsigned char". Change the
C prototype if you want numeric handling for your chars.

=head2 IMPORTING A FUNCTION WITH A PARAMETER LIST

You need to pass at minimum 4 parameters.

=over 4

=item 1.
The name of the library from which you want to import the function.

=item 2.
This parameter is optional, most people should skip it, skip does not mean
supplying undef. Supply a function pointer in the format of number C<1234>,
not string C<"\x01\x02\x03\x04">. Undef will be returned if the pointer is not
readable, L<Win32::GetLastError|Win32/Win32::GetLastError()>/L<perlvar/"$^E">
will be C<ERROR_NOACCESS>.

=item 3.
The name of the function (as exported by the library) or for function pointers
a name that is "friendly" to you. This name for a function pointer is also used
for Import(). No attempt is made to retrieve such a name from any DLL's export
table in the 2nd case.

=item 4.
The number and types of the arguments the function expects as input.

=item 5.
The type of the value returned by the function.

=item 6.
And optionally you can specify the calling convention, this defaults to
'__stdcall', alternatively you can specify '_cdecl' or '__cdecl' (API > v0.68)
or (API > v0.70_02) 'WINAPI', 'NTAPI', 'CALLBACK' (__stdcall), 'WINAPIV' (__cdecl) .
False is __stdcall. Vararg functions are always cdecl. MS DLLs are typically
stdcall. Non-MS DLLs are typically cdecl. If API > v0.75, mixing up the calling
convention on 32 bits is detected and Perl will C<croak> an error message and
C<die>.

=back

To better explain their meaning, let's suppose that we
want to import and call the Win32 API C<GetTempPath()>.
This function is defined in C as:

    DWORD WINAPI GetTempPathA( DWORD nBufferLength, LPSTR lpBuffer );

This is documented in the B<Win32 SDK Reference>; you can look
for it on the Microsoft's WWW site, or in your C compiler's 
documentation, if you own one.

=over 4

=item B<1.>

The first parameter is the name of the library file that 
exports this function; our function resides in the F<KERNEL32.DLL>
system file.

When specifying this name as parameter, the F<.DLL> extension
is implicit, and if no path is given, the file is searched through
a couple of directories, including: 

=over 4

=item 1. The directory from which the application loaded. 

=item 2. The current directory. 

=item 3. The Windows system directory (eg. c:\windows\system or system32).

=item 4. The Windows directory (eg. c:\windows).

=item 5. The directories that are listed in the PATH environment variable. 

=back

You may, but don't have to write F<C:\windows\system\kernel32.dll>; or
F<kernel32.dll>, only F<kernel32> is enough:

    $GetTempPath = new Win32::API::More('kernel32', ...

=item B<2.>

Since this function is from a DLL, skip the 2nd parameter. Skip does not
mean supplying undef.

=item B<3.>

Now for the real second parameter: the name of the function.
It must be written exactly as it is exported 
by the library (case is significant here).
If you are using Windows 95 or NT 4.0, you can use the B<Quick View> 
command on the DLL file to see the function it exports. 
Remember that you can only import functions from 32 or 64 bit DLLs:
in Quick View, the file's characteristics should report
somewhere "32 bit word machine"; as a rule of thumb,
when you see that all the exported functions are in upper case,
the DLL is a 16 bit one and you can't use it. You also can not load a 32 bit
DLL into a 64 bit Perl, or vice versa. If you try, C<new>/C<Import> will fail
and C<$^E> will be C<ERROR_BAD_EXE_FORMAT>.
If their capitalization looks correct, then it's probably a 32 bit
DLL. If you have Platform SDK or Visual Studio, you can use the Dumpbin
tool. Call it as C<dumpbin /exports name_of_dll.dll> on the command line.
If you have Mingw GCC, use objdump as
C<objdump -x name_of_dll.dll E<gt> dlldump.txt> and search for the word exports
in the very long output.

Also note that many Win32 APIs are exported twice, with the addition of
a final B<A> or B<W> to their name, for - respectively - the ASCII 
and the Unicode version.
When a function name is not found, Win32::API will actually append
an B<A> to the name and try again; if the extension is built on a
Unicode system, then it will try with the B<W> instead.
So our function name will be:

    $GetTempPath = new Win32::API::More('kernel32', 'GetTempPath', ...

In our case C<GetTempPath> is really loaded as C<GetTempPathA>.

=item B<4.>

The third parameter, the input parameter list, specifies how many 
arguments the function wants, and their types. It can be passed as
a single string, in which each character represents one parameter, 
or as a list reference. The following forms are valid:

    "abcd"
    [a, b, c, d]
    \@LIST

But those are not:

    (a, b, c, d)
    @LIST

The number of characters, or elements in the list, specifies the number 
of parameters, and each character or element specifies the type of an 
argument; allowed types are:

=over 4

=item C<I>: 
value is an unsigned integer (unsigned int)

=item C<i>: 
value is an signed integer (signed int or int)

=item C<N>: 
value is a unsigned pointer sized number (unsigned long)

=item C<n>: 
value is a signed pointer sized number (signed long or long)

=item C<Q>: 
value is a unsigned 64 bit integer number (unsigned long long, unsigned __int64)
See next item for details.

=item C<q>:
value is a signed 64 bit integer number (long long, __int64)
If your perl has 'Q'/'q' quads support for L<perlfunc/pack> then Win32::API's 'q'
is a normal perl numeric scalar. All 64 bit Perls have quad support. Almost no
32 bit Perls have quad support. On 32 bit Perls, without quad support,
Win32::API's 'q'/'Q' letter is a packed 8 byte string. So C<0x8000000050000000>
from a perl with native Quad support would be written as
C<"\x00\x00\x00\x50\x00\x00\x00\x80"> on a 32 bit Perl without Quad support.
To improve the use of 64 bit integers with Win32::API on a 32 bit Perl without
Quad support, there is a per Win32::API::* object setting called L</UseMI64>
that causes all quads to be accepted as, and returned as L<Math::Int64> objects.
For "in" params in Win32::API and Win32::API::More and "out" in
Win32::API::Callback only, if the argument is a reference, it will automatically
be treated as a Math::Int64 object without having to previously call
L</UseMI64>.

=item C<F>: 
value is a single precision (4 bytes) floating point number (float)

=item C<D>: 
value is a double precision (8 bytes) floating point number (double)

=item C<S>: 
value is a unsigned short (unsigned short)

=item C<s>: 
value is a signed short (signed short or short)

=item C<C>: 
value is a char (char), pass as C<"a">, not C<97>, C<"abc"> will truncate to C<"a">

=item C<P>: 
value is a pointer (to a string, structure, etc...)
padding out the buffer string is required, buffer overflow detection is
performed. Pack and unpack the data yourself. If P is a return type, only
null terminated strings or NULL pointer are supported. If P is an in type, NULL
is integer C<0>. C<undef>, C<"0">, and C<""+0> are not integer C<0>, C<"0"+0> is
integer C<0>.

It is suggested to
not use P as a return type and instead use N and read the memory yourself, and
free the pointer if applicable. This pointer is effectively undefined after the
C function returns control to Perl. The C function may not hold onto it after
the C function returns control. There are exceptions where the pointer will
remain valid after the C function returns control, but tread at your own risk,
and at your knowledge of Perl interpreter's C internals.

=item C<T>: 
value is a Win32::API::Struct object, in parameter only, pass by reference
(pointer) only, pass by copy not implemented, see other sections for more

=item C<K>:
value is a Win32::API::Callback object, in parameter only, (see L<Win32::API::Callback>)

=item C<V>:
no value, no parameters, stands for C<void>, may not be combined with any other
letters, equivalent to a ""

=back

For beginners, just skip this paragraph.
Note, all parameter types are little endian. This is probably what you want
unless the documentation for the C function you are calling explicitly says
the parameters must be big endian. If there is no documentation for your C
function or no mention of endianess in the documentation, this doesn't apply
to you and skip the rest of this paragraph. There is no inherent support
for big endian parameters. Perl's scalar numbers model is that numeric
scalars are effectively opaque and their machine representation is
irrelevant. On Windows Perl, scalar numbers are little endian
internally. So C<$number = 5; print "$number";> will put 5 on the screen.
C<$number> given to Win32::API will pass little endian integer 5 to the C
function call. This is almost surly what you want. If you really must pass
a big endian integer, do C<$number = unpack('L', pack('N', 5));>, then
C<print "$number";> will put 83886080 on the screen, but this is big endian 5,
and passing 83886080 to C<-E<gt>Call()> will make sure that
the C function is getting big endian 5. See L<perlpacktut> for more.

Our function needs two parameters: a number (C<DWORD>) and a pointer to a 
string (C<LPSTR>):

    $GetTempPath = new Win32::API('kernel32', 'GetTempPath', 'NP', ...

=item B<4.>

The fourth is the type of the value returned by the 
function. It can be one of the types seen above, plus another type named B<V> 
(for C<void>), used for functions that do not return a value.
In our example the value returned by GetTempPath() is a C<DWORD>, which is a
typedef for unsigned long, so our return type will be B<N>:

    $GetTempPath = new Win32::API::More('kernel32', 'GetTempPath', 'NP', 'N');

Now the line is complete, and the GetTempPath() API is ready to be used
in Perl. Before calling it, you should test that $GetTempPath is 
L<perlfunc/defined>, otherwise errors such as the function or the library could
not be loaded or the C prototype was unparsable happened, and no object was
created. If the return value is undefined, to get detailed error status, use
L<perlvar/"$^E"> or L<Win32::GetLastError|Win32/Win32::GetLastError()>. C<$^E>
is slower than C<Win32::GetLastError> and useless on Cygwin, but C<$^E> in
string context provides a readable description of the error. In numeric context,
C<$^E> is equivelent to C<Win32::GetLastError>. C<Win32::GetLastError> always
returns an integer error code. You may use
L<Win32::FormatMessage|Win32/Win32::FormatMessage()> to convert an integer error
code to a readable description on Cygwin and Native builds of Perl.

Our definition, with error checking added, should then look like this:

    $GetTempPath = new Win32::API::More('kernel32', 'GetTempPath', 'NP', 'N');
    if(not defined $GetTempPath) {
        die "Can't import API GetTempPath: $^E\n";
    }

=back

=head2 CALLING AN IMPORTED FUNCTION

To effectively make a call to an imported function you must use the
Call() method on the Win32::API object you created.
Continuing with the example from the previous paragraph, 
the GetTempPath() API can be called using the method:

    $GetTempPath->Call(...

Of course, parameters have to be passed as defined in the import phase.
In particular, if the number of parameters does not match (in the example,
if GetTempPath() is called with more or less than two parameters), 
Perl will C<croak> an error message and C<die>.

The two parameters needed here are the length of the buffer
that will hold the returned temporary path, and a pointer to the 
buffer itself.
For numerical parameters except for char, you can use either a constant expression
or a variable, it will be numified similar to the expression C<($var+0)>.
For pointers, also note that B<memory must be allocated before calling the function>,
just like in C.
For example, to pass a buffer of 80 characters to GetTempPath(),
it must be initialized before with:

    $lpBuffer = " " x 80;

This allocates a string of 80 characters. If you don't do so, you'll
probably get a fatal buffer overflow error starting in 0.69.
The call should therefore include:

    $lpBuffer = " " x 80;
    $GetTempPath->Call(80, $lpBuffer);

And the result will be stored in the $lpBuffer variable.
Note that you never need to pass a reference to the variable
(eg. you B<don't need> C<\$lpBuffer>), even if its value will be set 
by the function. 

A little problem here is that Perl does not trim the variable, 
so $lpBuffer will still contain 80 characters in return; the exceeding 
characters will be spaces, because we said C<" " x 80>.

In this case we're lucky enough, because the value returned by 
the GetTempPath() function is the length of the string, so to get
the actual temporary path we can write:

    $lpBuffer = " " x 80;
    $return = $GetTempPath->Call(80, $lpBuffer);
    $TempPath = substr($lpBuffer, 0, $return);

If you don't know the length of the string, you can usually
cut it at the C<\0> (ASCII zero) character, which is the string
delimiter in C:

    $TempPath = ((split(/\0/, $lpBuffer))[0];  
    # or    
    $lpBuffer =~ s/\0.*$//;

=head2 USING STRUCTURES

Starting from version 0.40, Win32::API comes with a support package
named Win32::API::Struct. The package is loaded automatically with
Win32::API, so you don't need to use it explicitly.

With this module you can conveniently define structures and use
them as parameters to Win32::API functions. A short example follows:


    # the 'POINT' structure is defined in C as:
    #     typedef struct {
    #        LONG  x;
    #        LONG  y;
    #     } POINT;
    

    #### define the structure
    Win32::API::Struct->typedef( POINT => qw{
        LONG x; 
        LONG y; 
    });
    
    #### import an API that uses this structure
    Win32::API->Import('user32', 'BOOL GetCursorPos(LPPOINT lpPoint)');
    
    #### create a 'POINT' object
    my $pt = Win32::API::Struct->new('POINT');
    
    #### call the function passing our structure object
    GetCursorPos($pt);
    
    #### and now, access its members
    print "The cursor is at: $pt->{x}, $pt->{y}\n";

Note that this works only when the function wants a 
B<pointer to a structure>, not a "pass by copy" structure. As you can see, our
structure is named 'POINT', but the API used 'LPPOINT'. Some heuristics are
done to validate the argument's type vs the parameter's type if the function
has a C prototype definition (not letter definition). First, if the parameter
type starts with the LP prefix, the LP prefix is stripped, then compared to
the argument's type. If that fails, the Win32::API::Type database
(see L<Win32::API::Type/typedef>)
will be used to convert the parameter type to the base type. If that fails,
the parameter type will be stripped of a trailing whitespace then a '*', and
then checked against the base type. L<Dies|perlfunc/die> if the parameter and
argument types do not match after 3 attempts.

For more information, see also L<Win32::API::Struct>.

If you don't want (or can't) use the C<Win32::API::Struct> facility,
you can still use the low-level approach to use structures:

=over 4

=item 1.

you have to L<pack()|perlfunc/pack> the required elements in a variable:

    $lpPoint = pack('ll', 0, 0); # store two LONGs

=item 2.

to access the values stored in a structure, L<unpack()|perlfunc/unpack> it as required:

    ($x, $y) = unpack(';;', $lpPoint); # get the actual values

=back

The rest is left as an exercise to the reader...

=head2 EXPORTED FUNCTIONS

=head3 ReadMemory

    $copy_of_memblock = ReadMemory($SourcePtr, $length);

Reads the source pointer for C<$length> number of bytes. Returns a copy of
the memory block in a scalar. No readability checking is done on C<$SourcePtr>.
C<$SourcePtr>'s format is 123456, not C<"\x01\x02\x03\x04">.

=head3 WriteMemory

    WriteMemory($DestPtr, $sourceScalar, $length);

Copies the string contents of the C<$sourceScalar> scalar to C<$DestPtr> for
C<$length> bytes. $length must be less than or equal to the length of
C<$sourceScalar>, otherwise the function croaks. No readability checking is
done on C<$DestPtr>. C<$DestPtr>'s format is 123456, not
C<"\x01\x02\x03\x04">. Returns nothing.

=head3 MoveMemory

    MoveMemory($destPtr, $sourcePtr, $length);

Copies a block of memory from one location to another. The source and
destination blocks may overlap. All pointers are in the format of 123456,
not C<"\x01\x02\x03\x04">.  No readability checking is done. Returns nothing.

=head3 IsBadReadPtr

    if(IsBadReadPtr($ptr, $length)) {die "bad ptr";}

Probes a memory block for C<$length> bytes for readability. Returns true if
access violation occurs, otherwise false is returned. This function is useful
to avoid dereferencing pointers which will crash the perl process. This function
has many limitations, including not detecting uninitialized memory, not
detecting freed memory, and not detecting gibberish. It can not tell whether a
function pointer is valid x86 machine code. Ideally, you should never use it,
or remove it once your code is stable. C<$ptr> is in the format of 123456,
not C<"\x01\x02\x03\x04">. See MS's documentation for a lot more
on this function of the same name.

=head3 SafeReadWideCString

    $source = Encode::encode("UTF-16LE","Just another perl h\x{00E2}cker\x00");
    $string = SafeReadWideCString(unpack('J',pack('p', $source)));
    die "impossible" if $source ne "Just another perl h\x{00E2}cker";

Safely (SEH aware) reads a utf-16 wide null terminated string (the first and
only parameter), into a scalar. Returns undef, if an access violation happens
or null pointer (same thing). The string pointer is in the format of 123456,
not C<"\x01\x02\x03\x04">. The returned scalar will be UTF8 marked if the string
can not be represented in the system's ANSI codepage. Conversion is done with
WideCharToMultiByte. Returns a 0 length scalar string if WideCharToMultiByte fails.
This function was created because L<pack's|perlfunc/pack> p letter won't read UTF16
and L</ReadMemory> and L</IsBadReadPtr> require an explicit length.

=head2 CONSTRUCTORS

=head3 new

    $obj = Win32::API::More->new([$dllname | (undef , $funcptr)], [$c_proto | ($in, $out [, $calling_convention])]);

See L</DESCRIPTION>.

=head3 Import
    $obj = Win32::API::More->Import([$dllname | (undef , $funcptr)], [$c_proto | ($in, $out [, $calling_convention])]);

See L</DESCRIPTION>.

=head2 METHODS

=head3 Call

The main method of a Win32::API object. Documented elsewhere in this document.

=head3 UseMI64

    $bool = $APIObj->UseMI64();
    $oldbool = $APIObj->UseMI64($newbool);

Turns on Quads as L<Math::Int64> objects support for a particular object
instance. You must call L<perlfunc/use>/L<perlfunc/require> on Math::Int64
before calling UseMI64. Win32::API does not C<use> Math::Int64 for you.
Works on Win32::API and Win32::API::Callback objects. This method
does not exist if your Perl natively supports Quads (64 bit Perl for example).
Takes 1 optional parameter, which is a true or false value to use or don't use
Math::Int64, returns the old setting, which is a true or false value. If called
without any parameters, returns current setting, which is a true or false value,
without setting the option. As discussed in L</q>, if you are not using
Math::Int64 you must supply/will receive 8 byte scalar strings for quads.
For "in" params in Win32::API and Win32::API::More and "out" in
Win32::API::Callback only, if the argument is a reference, it will automatically
be treated as a Math::Int64 object without having to previously call this
function.

=head2 VERBOSE DEBUGGING

If using C<Win32::GetLastError> and C<$^E> does not reveal the problem with your
use of Win32::API, you may turn on Win32::API's very verbose debugging mode as
follows

    BEGIN {
        $Win32::API::DEBUG = 1;
    }
    use Win32::API;
    $function = Win32::API::More->new(
        'mydll', 'int sum_integers(int a, int b)'
    );

=head1 HISTORY

=over 4

=item UseMI64 API change

Starting in 0.71, UseMI64 on a set returns old value, not previously
new value.

=item fork safe

Starting in 0.71, a Win32::API object can go through a fork and work
correctly in the child and parent psuedo-processes. Previously when either
psuedo-processes exited, the DLL would be unloaded and the other
psuedo-processes would crash if a Call() was done on the object.

=item return value signedness

Prior to 0.69, for numeric integer types, the return scalar was always signed.
Unsigned-ness was ignored.

=item shorts

Prior to 0.69, shorts were not supported. 'S' meant a sturct. To fix this
Win32::API::More class was created for 0.69. 'S'/'s' now means short, per pack's
letters. Struct has been moved to letter 'T'. Win32::API will continue to exist
for legacy code.

=item float return types

Prior to 0.69, if a function had a return type of float, it was silently
not called.

=item buffer overflow protection

Introduced in 0.69. If disabling is required, which is highly
B<not recommended>, set an environmental variable called
WIN32_API_SORRY_I_WAS_AN_IDIOT to 1.

=item automatic un/pack

Starting with 0.69, when using Win32::API::More, there is automatic un/packing
of pointers to numbers-ish things for in parameters when using the C
prototype interface.

=item Quads on 32 bit

Added in 0.70.

=item __stdcall vs __cdecl checking on 32 bits

Added in 0.76_01

=item Import returns an api obj on success, undef on failure, instead of 1 or 0

Added in 0.76_02

=item checking C<$!> for C<new>/C<Import> failure is broken and deprecated

Starting in 0.76_06, due to many bugs with C<new> and C<Import> not setting
L<perlvar/$!> or Win32 and C error codes overlapping and Win32 error codes being
stringified as different C error codes, checking C<$!> is deprecated and the
existing, partial setting of C<$!>, maybe removed in the future. Only check
C<Win32::GetLastError()> or C<$^E> to find out why the call failed.

=back

See the C<Changes> file for more details, many of which not mentioned here.

=head1 BUGS AND LIMITATIONS

=over 4

=item E<nbsp> Unicode DLL paths

Untested.

=item E<nbsp> ithreads

Minimally tested.

=item E<nbsp> C functions getting utf8 scalars vs byte scalars

Untested and undefined.

=back

=head1 SEE ALSO

L<Math::Int64>

L<Win32::API::Struct>

L<Win32::API::Type>

L<Win32::API::Callback>

L<Win32::API::Callback::IATPatch>

L<http://homepage.ntlworld.com/jonathan.deboynepollard/FGA/function-calling-conventions.html>

=head1 AUTHOR

Aldo Calpini ( I<dada@perl.it> ).

=head1 MAINTAINER

Cosimo Streppone ( I<cosimo@cpan.org> )

=head1 MAJOR CONTRIBUTOR

Daniel Dragan ( I<bulkdd@cpan.org> )

=head1 LICENSE

To finally clarify this, C<Win32::API> is OSI-approved free software;
you can redistribute it and/or modify it under the same terms as Perl
itself.

See L<http://dev.perl.org/licenses/artistic.html>

=head1 CREDITS

All the credits go to Andrea Frosini for the neat assembler trick
that makes this thing work. I've also used some work by Dave Roth
for the prototyping stuff. A big thank you also to Gurusamy Sarathy
for his invaluable help in XS development, and to all the Perl
community for being what it is.

Cosimo also wants to personally thank everyone that contributed
to Win32::API with complaints, emails, patches, RT bug reports
and so on.

=cut

